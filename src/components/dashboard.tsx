"use client";

import { useCallback, useEffect, useState } from "react";
import { Attendance } from "./attendance";
import { State, Table, avatarStyle, clockTime, elapsed, initials, staffLabel, tableLabel } from "./board";
import { Icon } from "./icon";
import { StaffSheet, SummarySheet, TableSheet, TablesSheet } from "./sheets";

type Panel = "attendance" | "staff" | "tables" | null;

export default function Dashboard() {
  const [data, setData] = useState<State | null>(null);
  const [online, setOnline] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [summary, setSummary] = useState<any>(null);
  const [dragging, setDragging] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/state?branch=roma", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Servidor no disponible");
      setData(body);
      setOnline(true);
    } catch { setOnline(false); }
  }, []);

  useEffect(() => {
    void refresh();
    const poll = window.setInterval(() => void refresh(), 1800);
    const tick = window.setInterval(() => setNow(new Date()), 15000);
    return () => { window.clearInterval(poll); window.clearInterval(tick); };
  }, [refresh]);

  const request = useCallback(async (payload: Record<string, unknown>) => {
    if (!data || !online || busy) return false;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ branchId: data.branch.id, ...payload }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "No se pudo completar la acción.");
      await refresh(); return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error de conexión."); return false;
    } finally { setBusy(false); }
  }, [data, online, busy, refresh]);

  const shift = data?.shift ?? null;
  const staff = shift?.staff ?? [];
  const rotation = shift?.rotation ?? [];
  const tables = data?.tables ?? [];
  const selected = tables.find(table => table.id === selectedId) ?? null;
  const count = (status: string) => tables.filter(table => table.status === status).length;
  const disabled = !online || busy;

  async function arrive(employeeId: string) {
    if (!shift && !(await request({ type: "start" }))) return;
    await request({ type: "arrive", employeeId });
  }

  async function closeShift() {
    if (!data || !shift) return;
    const open = tables.filter(table => table.assignment);
    if (open.length) { setMessage(`Libera las mesas abiertas antes de cerrar el turno: ${open.map(table => table.number).join(", ")}.`); return; }
    if (!window.confirm("¿Cerrar el turno?")) return;
    const shiftId = shift.id;
    if (await request({ type: "close" })) {
      const response = await fetch(`/api/summary?branchId=${data.branch.id}&shiftId=${shiftId}`, { cache: "no-store" });
      if (response.ok) setSummary(await response.json());
    }
  }

  async function reorder(order: typeof rotation) { await request({ type: "rotation", employeeIds: order.map(entry => entry.shiftEmployeeId) }); }
  async function move(from: number, to: number) {
    if (to < 0 || to >= rotation.length) return;
    const order = [...rotation]; const [entry] = order.splice(from, 1); order.splice(to, 0, entry);
    await reorder(order);
  }
  async function drop(targetId: string) {
    const from = rotation.findIndex(entry => entry.shiftEmployeeId === dragging);
    const to = rotation.findIndex(entry => entry.shiftEmployeeId === targetId);
    setDragging("");
    if (from < 0 || to < 0 || from === to) return;
    const order = [...rotation]; const [entry] = order.splice(from, 1); order.splice(to, 0, entry);
    await reorder(order);
  }

  const next = shift?.next ?? null;

  return <main className="app">
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">R</span>
        <div><h1>Roma</h1><span>Fatboy · servicio</span></div>
        <i className="live" data-on={online} title={online ? "En línea" : "Sin conexión"} />
      </div>

      <ul className="tally" aria-label="Estado del salón">
        <li data-s="FREE" title="Libres"><b>{count("FREE")}</b><span>libres</span></li>
        <li data-s="OCCUPIED" title="Ocupadas"><b>{count("OCCUPIED")}</b><span>ocupadas</span></li>
        <li data-s="BILLING" title="Por cobrar"><b>{count("BILLING")}</b><span>por cobrar</span></li>
        {count("RESERVED") > 0 && <li data-s="RESERVED" title="Reservadas"><b>{count("RESERVED")}</b><span>reservadas</span></li>}
      </ul>

      <nav className="actions">
        <span className="clock">{clockTime(now)}</span>
        {shift
          ? <button className="btn btn-ghost btn-sm" disabled={disabled} onClick={closeShift}><Icon name="stop" size={16} /> Cerrar turno</button>
          : <button className="btn btn-ghost btn-sm" disabled={disabled} onClick={() => void request({ type: "start" })}><Icon name="play" size={16} /> Abrir turno</button>}
        <button className="btn btn-primary btn-sm" onClick={() => setPanel("attendance")}><Icon name="list" size={18} /> Asistencia{staff.length > 0 && <span className="count">{staff.filter(member => !member.leftAt).length}</span>}</button>
        <button className="icon-btn" onClick={() => setPanel("staff")} aria-label="Meseros" title="Meseros"><Icon name="users" /></button>
        <button className="icon-btn" onClick={() => setPanel("tables")} aria-label="Mesas del salón" title="Mesas del salón"><Icon name="grid" /></button>
      </nav>
    </header>

    {message && <div role="alert" className="notice notice-error"><span>{message}</span><button onClick={() => setMessage("")} aria-label="Cerrar aviso"><Icon name="close" size={18} /></button></div>}
    {!online && <div role="status" className="notice notice-warn">Sin conexión con el servidor. Las acciones están en pausa mientras se reconecta.</div>}

    <div className="body">
      <aside className="rail">
        <section className="next" data-empty={!next}>
          {next ? <>
            <small>Sigue</small>
            <div className="next-who"><span className="avatar xl" style={avatarStyle(next.name)}>{initials(next.name)}</span><strong>{next.name}</strong></div>
            <button className="next-skip" disabled={disabled} onClick={() => void request({ type: "skip" })}><Icon name="skip" size={16} /> Saltar turno</button>
          </> : <>
            <small>Sigue</small>
            <strong className="next-none">{shift ? "Nadie disponible" : "Turno sin abrir"}</strong>
            <button className="next-skip" onClick={() => setPanel("attendance")}><Icon name="list" size={16} /> Pasar lista</button>
          </>}
        </section>

        <section className="queue">
          <header><h2>Orden de llegada</h2><span>{rotation.length}</span></header>
          {rotation.length === 0 ? <p className="queue-empty">Los meseros aparecen aquí en el orden en que marcan su llegada.</p> : <ol>
            {rotation.map((entry, index) => {
              const state = staff.find(member => member.employeeId === entry.employee.id)?.displayStatus ?? "OUT";
              const isNext = next?.id === entry.employee.id;
              return <li key={entry.id} data-next={isNext} data-dragging={dragging === entry.shiftEmployeeId} draggable onDragStart={() => setDragging(entry.shiftEmployeeId)} onDragOver={event => event.preventDefault()} onDrop={() => void drop(entry.shiftEmployeeId)} onDragEnd={() => setDragging("")}>
                <span className="pos">{index + 1}</span>
                <span className="avatar" style={avatarStyle(entry.employee.name)}>{initials(entry.employee.name)}</span>
                <div className="who"><strong>{entry.employee.name}</strong><span data-s={state}>{staffLabel[state] ?? state}{entry.skips > 0 && ` · saltó ${entry.skips}`}</span></div>
                <div className="nudge"><button disabled={disabled || index === 0} onClick={() => void move(index, index - 1)} aria-label={`Subir a ${entry.employee.name}`}><Icon name="up" size={16} /></button><button disabled={disabled || index === rotation.length - 1} onClick={() => void move(index, index + 1)} aria-label={`Bajar a ${entry.employee.name}`}><Icon name="down" size={16} /></button></div>
              </li>;
            })}
          </ol>}
        </section>
      </aside>

      <section className="floor" aria-label="Mesas">
        {tables.length === 0 && data ? <div className="empty big">No hay mesas todavía. Agrégalas con el botón <b>Mesas del salón</b> de arriba.</div> : <div className="tables">
          {tables.map(table => <TableCard key={table.id} table={table} disabled={disabled} onOpen={() => setSelectedId(table.id)} />)}
        </div>}
      </section>
    </div>

    {selected && data && <TableSheet key={selected.id} table={selected} data={data} online={online} busy={busy} request={request} onClose={() => setSelectedId(null)} />}
    {panel === "attendance" && data && <Attendance data={data} online={online} busy={busy} request={request} onArrive={id => void arrive(id)} onClose={() => setPanel(null)} />}
    {panel === "staff" && data && <StaffSheet data={data} online={online} busy={busy} request={request} onClose={() => setPanel(null)} />}
    {panel === "tables" && data && <TablesSheet data={data} online={online} busy={busy} request={request} onClose={() => setPanel(null)} />}
    {summary && <SummarySheet summary={summary} onClose={() => setSummary(null)} />}
  </main>;
}

function TableCard({ table, disabled, onOpen }: { table: Table; disabled: boolean; onOpen: () => void }) {
  const assignment = table.assignment;
  return <button className="tcard" data-s={table.status} disabled={disabled} onClick={onOpen} aria-label={`Mesa ${table.number}, ${tableLabel[table.status]}`}>
    <span key={table.status} className="tflash" aria-hidden="true" />
    <span className="tcard-top"><span className="tcard-num"><small>Mesa</small>{table.number}</span><span className="pill">{tableLabel[table.status]}</span></span>
    {assignment ? <span className="tcard-foot">
      <span className="avatar sm ink">{initials(assignment.employee.name)}</span>
      <span className="tcard-who"><strong>{assignment.employee.name}</strong><span>{assignment.people} {assignment.people === 1 ? "persona" : "personas"} · <b>{elapsed(assignment.assignedAt)}</b></span></span>
    </span> : <span className="tcard-foot tcard-cta"><span className="cta-dot"><Icon name={table.status === "RESERVED" ? "bookmark" : "plus"} size={18} /></span>{table.status === "RESERVED" ? "Toca para liberar" : "Toca para asignar"}</span>}
  </button>;
}
