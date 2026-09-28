import assert from "node:assert/strict";
import { test } from "node:test";
import { prisma } from "@/lib/prisma";
import { arrive, assignTable, closeShift, getSnapshot, setAvailability, shiftSummary, startShift, tableAction, skipNext } from "@/lib/operations";

test("turno: llegada, rotación, pausas, mesas, concurrencia, historial y resumen", async () => {
  const seededBranch = await prisma.branch.findUnique({ where: { slug: "venecia" }, include: { tables: true, employees: true } });
  assert.equal(seededBranch?.tables.length, 15);
  assert.equal(seededBranch?.employees.length, 8);
  const branch = await prisma.branch.create({ data: { name: "Venecia Pruebas", slug: "venecia-test" } });
  const employees = [];
  for (const name of ["Carlos", "Daniel", "Valentina", "Luis", "Elena"]) employees.push(await prisma.employee.create({ data: { name, branchId: branch.id } }));
  const tables = [];
  for (let number = 1; number <= 4; number++) tables.push(await prisma.restaurantTable.create({ data: { number, branchId: branch.id } }));

  const shift = await startShift(branch.id);
  for (const employee of employees) await arrive(branch.id, employee.id);
  let state = await getSnapshot(branch.slug);
  assert.deepEqual(state.shift?.rotation.map(e => e.employee.name), ["Carlos", "Daniel", "Valentina", "Luis", "Elena"]);
  assert.equal(state.shift?.next?.name, "Carlos");

  await assignTable(branch.id, tables[0].id, 3);
  state = await getSnapshot(branch.slug);
  assert.equal(state.shift?.next?.name, "Daniel");
  await assignTable(branch.id, tables[1].id, 4);
  state = await getSnapshot(branch.slug);
  assert.equal(state.shift?.next?.name, "Valentina");

  await setAvailability(branch.id, employees[2].id, "BREAK");
  state = await getSnapshot(branch.slug);
  assert.equal(state.shift?.next?.name, "Luis");
  await setAvailability(branch.id, employees[2].id, "RESUME");
  state = await getSnapshot(branch.slug);
  assert.equal(state.shift?.next?.name, "Valentina");

  await skipNext(branch.id);
  state = await getSnapshot(branch.slug);
  assert.equal(state.shift?.next?.name, "Luis");
  assert.equal(state.shift?.rotation.at(-1)?.skips, 1);

  const orderBeforeRelease = state.shift?.rotation.map(e => e.employee.name);
  await tableAction(branch.id, tables[0].id, "RELEASE");
  state = await getSnapshot(branch.slug);
  assert.deepEqual(state.shift?.rotation.map(e => e.employee.name), orderBeforeRelease);

  await tableAction(branch.id, tables[1].id, "TRANSFER", employees[3].id);
  await assignTable(branch.id, tables[2].id, 2, employees[3].id);
  const manual = await prisma.tableAssignment.findFirst({ where: { tableId: tables[2].id } });
  assert.equal(manual?.manual, true);
  state = await getSnapshot(branch.slug);
  assert.equal(state.shift?.rotation.at(-1)?.employee.name, "Luis");

  const concurrent = await Promise.allSettled([
    assignTable(branch.id, tables[3].id, 2),
    assignTable(branch.id, tables[3].id, 2),
  ]);
  assert.equal(concurrent.filter(r => r.status === "fulfilled").length, 1, "solo una asignación debe ganar la carrera sobre la misma mesa");
  assert.equal(concurrent.filter(r => r.status === "rejected").length, 1);

  const events = await prisma.eventLog.findMany({ where: { shiftId: shift.id } });
  assert.ok(events.some(e => e.action === "PAUSA"));
  assert.ok(events.some(e => e.action === "REACTIVACION"));
  assert.ok(events.some(e => e.action === "LIBERACION"));
  assert.ok(events.some(e => e.action === "ASIGNACION_MANUAL"));
  assert.ok(events.some(e => e.action === "CAMBIO_MANUAL_MESERO"));

  await assert.rejects(closeShift(branch.id), /quedan 3 mesas abiertas/);
  for (const table of tables.slice(1)) await tableAction(branch.id, table.id, "RELEASE");
  await closeShift(branch.id);
  const summary = await shiftSummary(branch.id, shift.id);
  assert.equal(summary.totalTables, 4);
  assert.equal(summary.openTables.length, 0);
  assert.equal(summary.staff.find(s => s.employee.name === "Carlos")?.tables, 1);
  assert.equal(summary.staff.find(s => s.employee.name === "Valentina")?.skips, 1);

  await prisma.$disconnect();
  const persisted = await prisma.shift.findUnique({ where: { id: shift.id }, include: { assignments: true } });
  assert.equal(persisted?.status, "CLOSED", "al reconectar el cliente se conservan los datos en SQLite");
  assert.equal(persisted?.assignments.length, 4);
});
