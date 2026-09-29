import { AssignmentStatus, Prisma, ShiftEmployeeStatus, ShiftStatus, TableStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { serializeWrites } from "@/lib/mutex";

export class OperationError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

type Tx = Prisma.TransactionClient;

async function activeShift(tx: Tx, branchId: string) {
  const shift = await tx.shift.findFirst({ where: { branchId, status: ShiftStatus.OPEN }, orderBy: { startedAt: "desc" } });
  if (!shift) throw new OperationError("Inicia el turno antes de realizar esta acción.", 409);
  return shift;
}

async function log(tx: Tx, data: {
  branchId: string; shiftId?: string; employeeId?: string; assignmentId?: string;
  tableNumber?: number; action: string; details?: string;
}) {
  await tx.eventLog.create({ data });
}

async function reorder(tx: Tx, shiftId: string, ids: string[]) {
  const entries = await tx.rotationEntry.findMany({ where: { shiftId } });
  if (!ids.length) return;
  await tx.rotationEntry.updateMany({ where: { shiftId }, data: { position: { increment: 1_000_000 } } });
  for (const [position, shiftEmployeeId] of ids.entries()) {
    await tx.rotationEntry.update({ where: { shiftEmployeeId }, data: { position } });
  }
  if (entries.length !== ids.length) throw new OperationError("La rotación cambió mientras se reorganizaba.", 409);
}

async function nextEligible(tx: Tx, shiftId: string) {
  const entries = await tx.rotationEntry.findMany({
    where: { shiftId, shiftEmployee: { leftAt: null, status: ShiftEmployeeStatus.AVAILABLE, employee: { active: true } } },
    orderBy: { position: "asc" }, include: { shiftEmployee: { include: { employee: true } } },
  });
  return entries[0] ?? null;
}

export async function getSnapshot(branchSlug = "roma") {
  const branch = await prisma.branch.findUnique({ where: { slug: branchSlug } });
  if (!branch) throw new OperationError("No se encontró la sucursal.", 404);
  const [tables, employees, shift, events] = await Promise.all([
    prisma.restaurantTable.findMany({ where: { branchId: branch.id }, orderBy: { number: "asc" } }),
    prisma.employee.findMany({ where: { branchId: branch.id }, orderBy: { name: "asc" } }),
    prisma.shift.findFirst({
      where: { branchId: branch.id, status: ShiftStatus.OPEN }, orderBy: { startedAt: "desc" },
      include: { employees: { include: { employee: true }, orderBy: { arrivalOrder: "asc" } }, rotation: { include: { shiftEmployee: { include: { employee: true } } }, orderBy: { position: "asc" } } },
    }),
    prisma.eventLog.findMany({ where: { branchId: branch.id }, orderBy: { createdAt: "desc" }, take: 12, include: { employee: true } }),
  ]);
  const assignments = await prisma.tableAssignment.findMany({
    where: { table: { branchId: branch.id }, releasedAt: null }, include: { employee: true },
  });
  const byId = new Map(assignments.map(a => [a.id, a]));
  const openCounts = new Map<string, number>();
  for (const a of assignments) openCounts.set(a.employeeId, (openCounts.get(a.employeeId) ?? 0) + 1);
  return {
    branch: { id: branch.id, name: branch.name, slug: branch.slug },
    tables: tables.map(t => ({ ...t, assignment: t.currentAssignmentId ? byId.get(t.currentAssignmentId) ?? null : null })),
    employees,
    shift: shift ? {
      id: shift.id, startedAt: shift.startedAt,
      staff: shift.employees.map(s => ({ ...s, displayStatus: s.leftAt ? "OUT" : s.status !== "AVAILABLE" ? s.status : (openCounts.get(s.employeeId) ?? 0) > 0 ? "SERVING" : "AVAILABLE" })),
      rotation: shift.rotation.map(r => ({ ...r, skips: r.shiftEmployee.skips, employee: r.shiftEmployee.employee })),
      next: (await prisma.rotationEntry.findFirst({ where: { shiftId: shift.id, shiftEmployee: { leftAt: null, status: "AVAILABLE", employee: { active: true } } }, orderBy: { position: "asc" }, include: { shiftEmployee: { include: { employee: true } } } }))?.shiftEmployee.employee ?? null,
    } : null,
    events,
  };
}

export async function startShift(branchId: string) {
  return serializeWrites(() => prisma.$transaction(async tx => {
    const existing = await tx.shift.findFirst({ where: { branchId, status: ShiftStatus.OPEN } });
    if (existing) throw new OperationError("Ya hay un turno abierto en esta sucursal.", 409);
    const shift = await tx.shift.create({ data: { branchId } });
    await log(tx, { branchId, shiftId: shift.id, action: "INICIO_TURNO" });
    return shift;
  }));
}

export async function arrive(branchId: string, employeeId: string) {
  return serializeWrites(() => prisma.$transaction(async tx => {
    const shift = await activeShift(tx, branchId);
    const employee = await tx.employee.findFirst({ where: { id: employeeId, branchId, active: true } });
    if (!employee) throw new OperationError("Mesero no disponible en esta sucursal.", 404);
    if (await tx.shiftEmployee.findUnique({ where: { shiftId_employeeId: { shiftId: shift.id, employeeId } } })) throw new OperationError("Este mesero ya registró su llegada.", 409);
    const order = await tx.shiftEmployee.count({ where: { shiftId: shift.id } });
    const member = await tx.shiftEmployee.create({ data: { shiftId: shift.id, employeeId, arrivalOrder: order } });
    const last = await tx.rotationEntry.count({ where: { shiftId: shift.id } });
    await tx.rotationEntry.create({ data: { shiftId: shift.id, shiftEmployeeId: member.id, position: last } });
    await log(tx, { branchId, shiftId: shift.id, employeeId, action: "LLEGADA", details: `Orden ${order + 1}` });
    return member;
  }));
}

export async function setAvailability(branchId: string, employeeId: string, action: "BREAK" | "EATING" | "RESUME" | "LEAVE") {
  return serializeWrites(() => prisma.$transaction(async tx => {
    const shift = await activeShift(tx, branchId);
    const member = await tx.shiftEmployee.findUnique({ where: { shiftId_employeeId: { shiftId: shift.id, employeeId } }, include: { employee: true, rotation: true } });
    if (!member || member.leftAt) throw new OperationError("El mesero no está activo en este turno.", 404);
    if (action !== "RESUME" && await tx.tableAssignment.count({ where: { employeeId, shiftId: shift.id, releasedAt: null } })) throw new OperationError("Libera o cambia sus mesas antes de poner al mesero en pausa o registrar su salida.", 409);
    const status = action === "BREAK" ? ShiftEmployeeStatus.BREAK : action === "EATING" ? ShiftEmployeeStatus.EATING : ShiftEmployeeStatus.AVAILABLE;
    await tx.shiftEmployee.update({ where: { id: member.id }, data: { status, ...(action === "LEAVE" ? { leftAt: new Date(), status: ShiftEmployeeStatus.OUT } : {}) } });
    if (action === "LEAVE") await tx.rotationEntry.deleteMany({ where: { shiftEmployeeId: member.id } });
    const names = { BREAK: "PAUSA", EATING: "COMIDA", RESUME: "REACTIVACION", LEAVE: "SALIDA" };
    await log(tx, { branchId, shiftId: shift.id, employeeId, action: names[action] });
    return { ok: true };
  }));
}

export async function assignTable(branchId: string, tableId: string, people: number, employeeId?: string) {
  if (!Number.isInteger(people) || people < 1 || people > 30) throw new OperationError("El número de personas debe estar entre 1 y 30.");
  return serializeWrites(() => prisma.$transaction(async tx => {
    const shift = await activeShift(tx, branchId);
    const table = await tx.restaurantTable.findFirst({ where: { id: tableId, branchId } });
    if (!table || table.status !== TableStatus.FREE) throw new OperationError("La mesa ya no está libre.", 409);
    const selected = employeeId
      ? await tx.shiftEmployee.findUnique({ where: { shiftId_employeeId: { shiftId: shift.id, employeeId } }, include: { employee: true, rotation: true } })
      : (await nextEligible(tx, shift.id))?.shiftEmployee;
    if (!selected || selected.leftAt || selected.status !== ShiftEmployeeStatus.AVAILABLE || !selected.employee.active) throw new OperationError("No hay meseros disponibles para asignar.", 409);
    const updated = await tx.restaurantTable.updateMany({ where: { id: tableId, branchId, status: TableStatus.FREE }, data: { status: TableStatus.OCCUPIED } });
    if (updated.count !== 1) throw new OperationError("La mesa ya fue asignada desde otra pantalla.", 409);
    const assignment = await tx.tableAssignment.create({ data: { shiftId: shift.id, tableId, employeeId: selected.employeeId, people, manual: Boolean(employeeId) } });
    await tx.restaurantTable.update({ where: { id: tableId }, data: { currentAssignmentId: assignment.id } });
    const entries = await tx.rotationEntry.findMany({ where: { shiftId: shift.id }, orderBy: { position: "asc" } });
    await reorder(tx, shift.id, [...entries.filter(e => e.shiftEmployeeId !== selected.id).map(e => e.shiftEmployeeId), selected.id]);
    await log(tx, { branchId, shiftId: shift.id, employeeId: selected.employeeId, assignmentId: assignment.id, tableNumber: table.number, action: employeeId ? "ASIGNACION_MANUAL" : "ASIGNACION", details: `${people} personas` });
    return assignment;
  }));
}

export async function tableAction(branchId: string, tableId: string, action: "BILLING" | "RELEASE" | "RESERVE" | "FREE" | "TRANSFER", employeeId?: string) {
  return serializeWrites(() => prisma.$transaction(async tx => {
    const shift = await activeShift(tx, branchId);
    const table = await tx.restaurantTable.findFirst({ where: { id: tableId, branchId } });
    if (!table) throw new OperationError("Mesa no encontrada.", 404);
    const assignment = table.currentAssignmentId ? await tx.tableAssignment.findUnique({ where: { id: table.currentAssignmentId }, include: { employee: true } }) : null;
    if (action === "BILLING" && assignment) {
      await tx.tableAssignment.update({ where: { id: assignment.id }, data: { status: AssignmentStatus.BILLING } });
      await tx.restaurantTable.update({ where: { id: table.id }, data: { status: TableStatus.BILLING } });
    } else if (action === "RELEASE") {
      if (!assignment) throw new OperationError("La mesa no tiene una asignación activa.");
      await tx.tableAssignment.update({ where: { id: assignment.id }, data: { status: AssignmentStatus.CLOSED, releasedAt: new Date() } });
      await tx.restaurantTable.update({ where: { id: table.id }, data: { status: TableStatus.FREE, currentAssignmentId: null } });
    } else if (action === "RESERVE" || action === "FREE") {
      if (assignment) throw new OperationError("Primero debe liberar la mesa ocupada.");
      await tx.restaurantTable.update({ where: { id: table.id }, data: { status: action === "RESERVE" ? TableStatus.RESERVED : TableStatus.FREE } });
    } else if (action === "TRANSFER" && assignment && employeeId) {
      const member = await tx.shiftEmployee.findUnique({ where: { shiftId_employeeId: { shiftId: shift.id, employeeId } }, include: { employee: true } });
      if (!member || member.leftAt || member.status !== ShiftEmployeeStatus.AVAILABLE) throw new OperationError("El mesero elegido no está disponible.", 409);
      await tx.tableAssignment.update({ where: { id: assignment.id }, data: { employeeId, manual: true } });
    } else throw new OperationError("Acción no válida para esta mesa.");
    const actionNames = { BILLING: "POR_COBRAR", RELEASE: "LIBERACION", RESERVE: "RESERVA", FREE: "MESA_LIBRE", TRANSFER: "CAMBIO_MANUAL_MESERO" };
    await log(tx, { branchId, shiftId: shift.id, employeeId: action === "TRANSFER" ? employeeId : assignment?.employeeId, assignmentId: assignment?.id, tableNumber: table.number, action: actionNames[action] });
    return { ok: true };
  }));
}

export async function saveRotation(branchId: string, employeeIds: string[]) {
  return serializeWrites(() => prisma.$transaction(async tx => {
    const shift = await activeShift(tx, branchId);
    const entries = await tx.rotationEntry.findMany({ where: { shiftId: shift.id } });
    if (employeeIds.length !== entries.length || new Set(employeeIds).size !== entries.length || entries.some(e => !employeeIds.includes(e.shiftEmployeeId))) throw new OperationError("La rotación recibida no coincide con el turno actual.", 409);
    await reorder(tx, shift.id, employeeIds);
    await log(tx, { branchId, shiftId: shift.id, action: "REORDEN_MANUAL", details: employeeIds.join(",") });
    return { ok: true };
  }));
}

export async function skipNext(branchId: string) {
  return serializeWrites(() => prisma.$transaction(async tx => {
    const shift = await activeShift(tx, branchId);
    const next = await nextEligible(tx, shift.id);
    if (!next) throw new OperationError("No hay meseros disponibles para saltar.", 409);
    const entries = await tx.rotationEntry.findMany({ where: { shiftId: shift.id }, orderBy: { position: "asc" } });
    await reorder(tx, shift.id, [...entries.filter(e => e.shiftEmployeeId !== next.shiftEmployeeId).map(e => e.shiftEmployeeId), next.shiftEmployeeId]);
    await tx.shiftEmployee.update({ where: { id: next.shiftEmployeeId }, data: { skips: { increment: 1 } } });
    await log(tx, { branchId, shiftId: shift.id, employeeId: next.shiftEmployee.employeeId, action: "SALTO_TURNO" });
    return { ok: true };
  }));
}

export async function closeShift(branchId: string) {
  return serializeWrites(() => prisma.$transaction(async tx => {
    const shift = await activeShift(tx, branchId);
    const open = await tx.tableAssignment.findMany({ where: { shiftId: shift.id, releasedAt: null }, include: { table: true } });
    if (open.length) throw new OperationError(`No se puede cerrar: quedan ${open.length} mesas abiertas (${open.map(a => a.table.number).join(", ")}).`, 409);
    await tx.shift.update({ where: { id: shift.id }, data: { status: ShiftStatus.CLOSED, endedAt: new Date() } });
    await log(tx, { branchId, shiftId: shift.id, action: "CIERRE_TURNO" });
    return { ok: true };
  }));
}

export async function shiftSummary(branchId: string, shiftId: string) {
  const shift = await prisma.shift.findFirst({ where: { id: shiftId, branchId }, include: { employees: { include: { employee: true, rotation: true }, orderBy: { arrivalOrder: "asc" } }, assignments: { include: { employee: true, table: true } } } });
  if (!shift) throw new OperationError("Turno no encontrado.", 404);
  return {
    shift,
    totalTables: shift.assignments.length,
    openTables: shift.assignments.filter(a => !a.releasedAt).map(a => a.table.number),
    staff: shift.employees.map(s => {
      const work = shift.assignments.filter(a => a.employeeId === s.employeeId);
      return { employee: s.employee, arrival: s.arrivedAt, departure: s.leftAt, tables: work.length, people: work.reduce((n, a) => n + a.people, 0), skips: s.skips };
    }),
  };
}

export async function addEmployee(branchId: string, name: string) {
  const clean = name.trim().replace(/\s+/g, " ");
  if (clean.length < 2 || clean.length > 60) throw new OperationError("Escribe un nombre de 2 a 60 caracteres.");
  return serializeWrites(() => prisma.employee.create({ data: { branchId, name: clean } }));
}

export async function addTable(branchId: string, number: number) {
  if (!Number.isInteger(number) || number < 1 || number > 999) throw new OperationError("El número de mesa debe estar entre 1 y 999.");
  return serializeWrites(() => prisma.restaurantTable.create({ data: { branchId, number } }));
}

export async function deleteTable(branchId: string, tableId: string) {
  return serializeWrites(() => prisma.$transaction(async tx => {
    const table = await tx.restaurantTable.findFirst({ where: { id: tableId, branchId } });
    if (!table) throw new OperationError("Mesa no encontrada.", 404);
    if (table.status !== TableStatus.FREE || table.currentAssignmentId) throw new OperationError("Libera la mesa antes de eliminarla.", 409);
    if (await tx.tableAssignment.count({ where: { tableId } })) throw new OperationError("Esta mesa tiene historial de servicio y no se puede eliminar.", 409);
    await tx.restaurantTable.delete({ where: { id: tableId } });
    return { ok: true };
  }));
}

export async function toggleEmployee(branchId: string, employeeId: string) {
  return serializeWrites(() => prisma.$transaction(async tx => {
    const employee = await tx.employee.findFirst({ where: { id: employeeId, branchId } });
    if (!employee) throw new OperationError("Mesero no encontrado.", 404);
    if (employee.active && await tx.shiftEmployee.count({ where: { employeeId, leftAt: null, shift: { status: ShiftStatus.OPEN } } })) throw new OperationError("Registra primero la salida del mesero en turno.", 409);
    await tx.employee.update({ where: { id: employeeId }, data: { active: !employee.active } });
    await log(tx, { branchId, employeeId, action: employee.active ? "MESERO_INACTIVO" : "MESERO_ACTIVO" });
    return { ok: true };
  }));
}

export async function deleteEmployee(branchId: string, employeeId: string) {
  return serializeWrites(() => prisma.$transaction(async tx => {
    const employee = await tx.employee.findFirst({ where: { id: employeeId, branchId } });
    if (!employee) throw new OperationError("Mesero no encontrado.", 404);
    if (await tx.shiftEmployee.count({ where: { employeeId, leftAt: null, shift: { status: ShiftStatus.OPEN } } })) throw new OperationError("Registra primero la salida del mesero en turno.", 409);
    const hasHistory = await tx.shiftEmployee.count({ where: { employeeId } })
      || await tx.tableAssignment.count({ where: { employeeId } })
      || await tx.eventLog.count({ where: { employeeId } });
    if (hasHistory && !employee.active) throw new OperationError("Este empleado tiene historial y se conserva inactivo para mantener los reportes.", 409);
    if (hasHistory) {
      await tx.employee.update({ where: { id: employeeId }, data: { active: false } });
      await log(tx, { branchId, employeeId, action: "MESERO_INACTIVO" });
      return { archived: true };
    }
    await tx.employee.delete({ where: { id: employeeId } });
    return { archived: false };
  }));
}
