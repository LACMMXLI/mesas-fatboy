"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type Employee = { id: string; name: string; active: boolean };
type Staff = { id: string; employeeId: string; employee: Employee; arrivedAt: string; leftAt: string | null; status: string; displayStatus: string };
type Assignment = { id: string; employeeId: string; employee: Employee; people: number; assignedAt: string; status: string };
type Table = { id: string; number: number; status: string; assignment: Assignment | null };
type EventItem = { id: string; action: string; tableNumber: number | null; createdAt: string; employee: Employee | null; details: string | null };
type State = { branch: { id: string; name: string; slug: string }; tables: Table[]; employees: Employee[]; shift: null | { id: string; startedAt: string; staff: Staff[]; rotation: { id: string; employee: Employee; shiftEmployeeId: string; skips: number }[]; next: Employee | null }; events: EventItem[] };

const statusLabel: Record<string, string> = { FREE: "LIBRE", OCCUPIED: "OCUPADA", BILLING: "POR COBRAR", RESERVED: "RESERVADA", AVAILABLE: "DISPONIBLE", SERVING: "ATENDIENDO", BREAK: "DESCANSO", EATING: "COMIENDO", OUT: "FUERA" };
const eventLabel: Record<string, string> = { INICIO_TURNO: "Turno iniciado", CIERRE_TURNO: "Turno cerrado", LLEGADA: "Llegada registrada", ASIGNACION: "Mesa asignada", ASIGNACION_MANUAL: "Asignación manual", LIBERACION: "Mesa liberada", POR_COBRAR: "Por cobrar", CAMBIO_MANUAL_MESERO: "Cambio manual de mesero", SALTO_TURNO: "Salto de turno", PAUSA: "Descanso", COMIDA: "Comida", REACTIVACION: "Reactivado", SALIDA: "Salida registrada", REORDEN_MANUAL: "Rotación reorganizada", RESERVA: "Mesa reservada", MESA_LIBRE: "Mesa libre", MESERO_ACTIVO: "Mesero activado", MESERO_INACTIVO: "Mesero desactivado" };
const time = (date: string) => new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" }).format(new Date(date));
const duration = (date: string) => {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 1000));
  return `${Math.floor(seconds / 3600).toString().padStart(2, "0")}:${Math.floor(seconds % 3600 / 60).toString().padStart(2, "0")}`;
};

export default function Dashboard() {
  const [data, setData] = useState<State | null>(null);
  const [online, setOnline] = useState(false);
  const [clock, setClock] = useState(new Date());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<Table | null>(null);
  const [people, setPeople] = useState(2);
  const [chosenEmployee, setChosenEmployee] = useState("");
  const [summary, setSummary] = useState<any>(null);
  const [showStaff, setShowStaff] = useState(false);
  const [showCatalog, setShowCatalog] = useState(false);
  const [newName, setNewName] = useState("");
  const [dragging, setDragging] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/state?branch=venecia", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Servidor no disponible");
      setData(body);
      setSelected(current => current ? body.tables.find((table: Table) => table.id === current.id) ?? null : null);
      setOnline(true);
    } catch { setOnline(false); }
  }, []);

  useEffect(() => {
    void refresh();
    const poll = window.setInterval(() => void refresh(), 1800);
    const tick = window.setInterval(() => setClock(new Date()), 1000);
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

  const activeStaff = data?.shift?.staff ?? [];
  const currentOrder = data?.shift?.rotation ?? [];
  const availableForManual = useMemo(() => activeStaff.filter(s => !s.leftAt && s.status === "AVAILABLE"), [activeStaff]);

  async function startShift() { await request({ type: "start" }); }
  async function closeShift() {
    if (!data?.shift) return;
    const open = data.tables.filter(table => table.assignment);
    if (open.length) { setMessage(`Libera las mesas abiertas antes de cerrar: ${open.map(table => table.number).join(", ")}.`); return; }
    if (!window.confirm("¿Cerrar el turno?")) return;
    const shiftId = data.shift.id;
    if (await request({ type: "close" })) {
      const response = await fetch(`/api/summary?branchId=${data.branch.id}&shiftId=${shiftId}`, { cache: "no-store" });
      if (response.ok) setSummary(await response.json());
    }
  }
  async function assign() {
    if (!selected) return;
    if (await request({ type: "assign", tableId: selected.id, people, ...(chosenEmployee ? { employeeId: chosenEmployee } : {}) })) setSelected(null);
  }
  async function tableAction(action: string, employeeId?: string) {
    if (!selected) return;
    if (action === "RELEASE" && !window.confirm(`¿Liberar mesa ${selected.number}?`)) return;
    if (await request({ type: "table", tableId: selected.id, action, employeeId })) setSelected(null);
  }
  async function addEmployee(event: FormEvent) {
    event.preventDefault();
    if (await request({ type: "addEmployee", name: newName })) setNewName("");
  }
  async function moveRotation(from: number, to: number) {
    if (to < 0 || to >= currentOrder.length) return;
    const order = [...currentOrder]; const [entry] = order.splice(from, 1); order.splice(to, 0, entry);
    await request({ type: "rotation", employeeIds: order.map(e => e.shiftEmployeeId) });
  }
  async function dropRotation(targetId: string) {
    if (!dragging || dragging === targetId) return;
    const order = [...currentOrder]; const from = order.findIndex(e => e.shiftEmployeeId === dragging); const to = order.findIndex(e => e.shiftEmployeeId === targetId);
    if (from >= 0 && to >= 0) { const [entry] = order.splice(from, 1); order.splice(to, 0, entry); await request({ type: "rotation", employeeIds: order.map(e => e.shiftEmployeeId) }); }
    setDragging("");
  }

  return <main className="dashboard-app min-h-screen bg-ink px-3 pb-5 pt-3 text-white sm:px-5 lg:px-7">
    <header className="dashboard-header mb-4 flex min-h-16 items-center justify-between gap-3 border-b border-white/10 pb-3">
      <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold text-xl font-black text-black">F</div><div><div className="text-xs font-bold tracking-[.24em] text-gold">FATBOY</div><h1 className="text-lg font-bold leading-tight sm:text-xl">Rotación de mesas <span className="font-normal text-white/45">· {data?.branch.name ?? "Venecia"}</span></h1></div></div>
      <div className="flex items-center gap-2 sm:gap-4"><button onClick={() => setShowStaff(true)} className="min-h-10 rounded-lg border border-white/15 px-3 text-xs font-black tracking-wide hover:border-gold hover:text-gold">EQUIPO</button><div className="hidden text-right sm:block"><div className="text-xs uppercase tracking-widest text-white/40">{data?.shift ? "Turno activo" : "Sin turno activo"}</div><div className="font-semibold">{data?.shift ? `Desde ${time(data.shift.startedAt)}` : "Venecia"}</div></div><div className="text-xl font-bold tabular-nums sm:text-2xl">{new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" }).format(clock)}</div><div className={`rounded-full px-3 py-2 text-xs font-bold ${online ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/20 text-red-300"}`}><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-current" />{online ? "EN LÍNEA" : "DESCONECTADO"}</div></div>
    </header>

    {message && <div role="alert" className="mb-3 flex items-center justify-between rounded-xl border border-red-500/40 bg-red-950/60 px-4 py-3 text-sm text-red-100"><span>{message}</span><button onClick={() => setMessage("")} className="ml-3 min-h-8 px-2 text-lg" aria-label="Cerrar aviso">×</button></div>}
    {!online && <div role="status" className="mb-3 rounded-xl border border-red-500/30 bg-red-950/30 px-4 py-3 text-sm text-red-200">Sin conexión con el servidor. Las acciones están pausadas; reconectando…</div>}

    <div className="dashboard-grid grid grid-cols-[minmax(245px,300px)_1fr] items-start gap-4">
      <aside className="sidebar space-y-4">
        <section className="rotation-panel rounded-2xl border border-white/10 bg-panel p-4 shadow-xl">
          <div className="mb-3 flex items-center justify-between"><div><p className="text-[11px] font-bold tracking-[.18em] text-white/45">ORDEN DE LLEGADA</p><h2 className="mt-1 text-lg font-bold">Rotación <span className="text-sm font-medium text-white/45">{currentOrder.length}</span></h2></div>{data?.shift && <button disabled={!online || busy || !data.shift.next} onClick={() => request({ type: "skip" })} className="min-h-11 rounded-xl border border-white/15 px-3 text-xs font-bold text-white/75 hover:border-gold hover:text-gold disabled:opacity-40">SALTAR</button>}</div>
          {!data?.shift ? <div className="rounded-xl bg-white/5 p-4 text-sm text-white/50">Inicia el turno para registrar llegadas y comenzar la rotación.</div> : currentOrder.length === 0 ? <div className="rounded-xl bg-white/5 p-4 text-sm text-white/50">Registra la llegada de los meseros para armar la rotación.</div> : <ol className="space-y-2">
            {currentOrder.map((entry, index) => {
              const member = activeStaff.find(s => s.employeeId === entry.employee.id);
              const state = member?.displayStatus ?? "OUT";
              return <li key={entry.id} draggable onDragStart={() => setDragging(entry.shiftEmployeeId)} onDragOver={e => e.preventDefault()} onDrop={() => void dropRotation(entry.shiftEmployeeId)} onDragEnd={() => setDragging("")} className={`flex min-h-[62px] items-center gap-2 rounded-xl border px-2.5 ${index === 0 ? "border-gold/70 bg-gold/10" : "border-white/8 bg-black/15"} ${dragging === entry.shiftEmployeeId ? "opacity-40" : ""}`}>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black ${index === 0 ? "bg-gold text-black" : "bg-white/10 text-white/70"}`}>{index + 1}</span>
                <div className="min-w-0 flex-1"><div className="truncate font-bold">{entry.employee.name}</div><div className={`mt-0.5 text-[10px] font-bold tracking-wider ${state === "AVAILABLE" ? "text-emerald-300" : state === "SERVING" ? "text-sky-300" : state === "OUT" ? "text-white/35" : "text-amber-300"}`}>{statusLabel[state] ?? state}</div></div>
                {entry.skips > 0 && <span className="rounded-md bg-white/10 px-1.5 py-1 text-[10px] text-white/50" title="Saltos registrados">↷{entry.skips}</span>}
                <div className="flex flex-col"><button disabled={!online || busy || index === 0} onClick={() => void moveRotation(index, index - 1)} className="h-7 w-7 text-white/50 hover:text-gold disabled:opacity-20" aria-label={`Subir a ${entry.employee.name}`}>⌃</button><button disabled={!online || busy || index === currentOrder.length - 1} onClick={() => void moveRotation(index, index + 1)} className="h-7 w-7 text-white/50 hover:text-gold disabled:opacity-20" aria-label={`Bajar a ${entry.employee.name}`}>⌄</button></div>
              </li>;
            })}
          </ol>}
          {data?.shift && <div className="mt-4 rounded-xl border border-gold/30 bg-gold/10 p-3"><div className="text-[10px] font-bold tracking-[.16em] text-gold">SIGUIENTE MESA PARA</div><div className="mt-1 truncate text-2xl font-black uppercase">{data.shift.next?.name ?? "—"}</div></div>}
        </section>
      </aside>

      <section className="main-column min-w-0 space-y-4">
        {!data?.shift ? <div className="flex min-h-40 flex-col items-start justify-center rounded-2xl border border-gold/25 bg-gradient-to-r from-gold/10 to-transparent p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold tracking-[.18em] text-gold">VENECIA · INICIO DE OPERACIÓN</p><h2 className="mt-2 text-2xl font-black sm:text-3xl">Listos para recibir el turno</h2><p className="mt-1 text-sm text-white/50">Registra las llegadas en el orden en que se presentan.</p></div><button disabled={!online || busy} onClick={startShift} className="mt-4 min-h-14 w-full rounded-xl bg-gold px-7 text-base font-black text-black shadow-lg shadow-gold/10 hover:bg-yellow-300 disabled:opacity-40 sm:mt-0 sm:w-auto">INICIAR TURNO</button></div> : <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-panel px-4 py-3"><div><div className="text-xs font-bold tracking-[.18em] text-emerald-300">TURNO EN CURSO</div><div className="mt-1 font-semibold">Inició a las {time(data.shift.startedAt)} <span className="ml-2 font-normal text-white/45">· {data.tables.filter(t => t.assignment).length} mesas abiertas</span></div></div><button disabled={!online || busy} onClick={closeShift} className="min-h-12 rounded-xl border border-white/15 px-5 text-sm font-bold hover:border-red-400 hover:text-red-300 disabled:opacity-40">CERRAR TURNO</button></div>}

        <div className="service-heading flex items-end justify-between"><div><p className="text-[11px] font-bold tracking-[.18em] text-white/40">SERVICIO</p><h2 className="mt-1 text-2xl font-black">Mesas <span className="text-base font-medium text-white/40">{data?.tables.length ?? "—"}</span></h2></div><div className="flex flex-wrap justify-end gap-2 text-[10px] font-bold sm:text-xs">{[["LIBRE", "bg-emerald-400"], ["OCUPADA", "bg-red-500"], ["POR COBRAR", "bg-gold"], ["RESERVADA", "bg-sky-400"]].map(([name, color]) => <span key={name} className="flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1.5"><i className={`h-2 w-2 rounded-full ${color}`} />{name}</span>)}</div></div>

        <div className="table-grid grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">{data?.tables.map(table => {
          const status = table.status; const active = table.assignment;
          const color = status === "FREE" ? "border-emerald-400/50 bg-emerald-500/10 hover:bg-emerald-500/15" : status === "BILLING" ? "border-gold/65 bg-gold/10 hover:bg-gold/15" : status === "RESERVED" ? "border-sky-400/55 bg-sky-500/10 hover:bg-sky-500/15" : "border-red-500/50 bg-red-500/10 hover:bg-red-500/15";
          return <button key={table.id} onClick={() => { setSelected(table); setPeople(2); setChosenEmployee(""); }} disabled={!online || busy} className={`table-card relative flex min-h-[145px] flex-col rounded-2xl border p-3 text-left transition-colors active:scale-[.98] disabled:opacity-45 sm:min-h-[158px] sm:p-4 ${color}`}>
            <div className="flex w-full items-start justify-between"><span className="text-[10px] font-bold tracking-[.16em] text-white/50">MESA</span><span className={`rounded-full px-2 py-1 text-[9px] font-black tracking-wide ${status === "FREE" ? "bg-emerald-400/20 text-emerald-200" : status === "BILLING" ? "bg-gold/20 text-gold" : status === "RESERVED" ? "bg-sky-400/20 text-sky-200" : "bg-red-400/20 text-red-200"}`}>{statusLabel[status]}</span></div>
            <div className="mt-0.5 text-4xl font-black leading-none sm:text-5xl">{table.number.toString().padStart(2, "0")}</div>
            {active ? <div className="mt-auto w-full pt-2"><div className="truncate text-sm font-bold">{active.employee.name}</div><div className="mt-1 flex items-center justify-between text-[10px] text-white/55"><span>{active.people} personas · {time(active.assignedAt)}</span><span className="font-mono tabular-nums">{duration(active.assignedAt)}</span></div></div> : <div className="mt-auto pt-2 text-xs font-medium text-white/45">{status === "RESERVED" ? "Toca para liberar" : "Toca para asignar"}</div>}
          </button>;
        })}</div>

        <section className="activity-panel rounded-2xl border border-white/10 bg-panel p-4"><div className="mb-3 flex items-center justify-between"><div><p className="text-[11px] font-bold tracking-[.16em] text-white/40">ACTIVIDAD RECIENTE</p><h2 className="mt-1 font-bold">Últimos movimientos</h2></div><span className="text-xs text-white/35">Actualización en vivo</span></div><div className="scrollbar flex gap-2 overflow-x-auto pb-1">{data?.events.length ? data.events.slice(0, 3).map(event => <div key={event.id} className="min-w-[190px] rounded-xl border border-white/8 bg-black/20 px-3 py-2.5"><div className="flex items-center justify-between gap-2"><span className="text-xs font-bold">{eventLabel[event.action] ?? event.action}</span><span className="shrink-0 text-[10px] text-white/40">{time(event.createdAt)}</span></div><div className="mt-1 truncate text-xs text-white/50">{event.tableNumber ? `Mesa ${event.tableNumber} · ` : ""}{event.employee?.name ?? event.details ?? "Sin usuario"}</div></div>) : <p className="py-3 text-sm text-white/35">Los movimientos del turno aparecerán aquí.</p>}</div></section>
      </section>
    </div>

    {showStaff && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm" onMouseDown={e => { if (e.target === e.currentTarget) setShowStaff(false); }}><section role="dialog" aria-modal="true" aria-labelledby="staff-title" className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#1b1b1b] p-4 shadow-2xl"><div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-bold tracking-[.16em] text-gold">OPERACIÓN</p><h2 id="staff-title" className="text-xl font-black">Equipo y meseros</h2></div><button onClick={() => setShowStaff(false)} className="min-h-11 min-w-11 rounded-full bg-white/8 text-2xl" aria-label="Cerrar">×</button></div>
      {data?.shift && <section className="mb-5"><h3 className="mb-2 text-sm font-bold">Llegadas y estado del turno</h3><div className="mb-3 flex flex-wrap gap-2">{data.employees.filter(e => e.active && !activeStaff.some(s => s.employeeId === e.id)).map(e => <button key={e.id} disabled={!online || busy} onClick={() => request({ type: "arrive", employeeId: e.id })} className="min-h-10 rounded-lg border border-white/15 px-3 text-sm font-semibold hover:border-gold hover:text-gold disabled:opacity-40">+ {e.name}</button>)}{data.employees.every(e => !e.active || activeStaff.some(s => s.employeeId === e.id)) && <span className="py-2 text-xs text-white/35">Todos registrados</span>}</div><ul className="grid gap-2 sm:grid-cols-2">{activeStaff.map(member => <li key={member.id} className="flex items-center gap-2 rounded-xl bg-black/20 px-3 py-2"><div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{member.employee.name}</div><div className="text-[10px] uppercase tracking-wider text-white/40">{statusLabel[member.displayStatus] ?? member.displayStatus} · llegó {time(member.arrivedAt)}</div></div><select aria-label={`Estado de ${member.employee.name}`} value={member.status === "AVAILABLE" ? "RESUME" : member.status} disabled={!online || busy || member.leftAt !== null} onChange={e => void request({ type: "availability", employeeId: member.employeeId, action: e.target.value })} className="min-h-10 max-w-32 rounded-lg border border-white/10 bg-[#252525] px-2 text-xs"><option value="RESUME">Disponible</option><option value="BREAK">Descanso</option><option value="EATING">Comiendo</option><option value="LEAVE">Registrar salida</option></select></li>)}</ul></section>}
      <section><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-bold">Catálogo de meseros</h3><button onClick={() => setShowCatalog(v => !v)} className="min-h-10 rounded-lg bg-white/8 px-3 text-xs font-bold hover:bg-white/15">{showCatalog ? "CERRAR" : "ADMINISTRAR"}</button></div>{showCatalog && <><form onSubmit={addEmployee} className="mb-3 flex gap-2"><input value={newName} onChange={e => setNewName(e.target.value)} maxLength={60} placeholder="Nombre del mesero" className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-gold"/><button disabled={!online || busy} className="min-h-10 rounded-lg bg-gold px-3 text-sm font-black text-black disabled:opacity-40">AÑADIR</button></form><ul className="scrollbar max-h-56 space-y-1 overflow-y-auto">{data?.employees.map(employee => <li key={employee.id} className="flex items-center justify-between rounded-lg px-2 py-2 text-sm"><span className={employee.active ? "" : "text-white/40"}>{employee.name}{!employee.active && " · inactivo"}</span><button disabled={!online || busy} onClick={() => request({ type: "toggleEmployee", employeeId: employee.id })} className="min-h-9 rounded-lg px-3 text-xs font-bold text-gold hover:bg-white/10">{employee.active ? "DESACTIVAR" : "ACTIVAR"}</button></li>)}</ul></>}</section>
    </section></div>}

    {selected && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget) setSelected(null); }}><section role="dialog" aria-modal="true" aria-labelledby="table-title" className="safe-bottom max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-white/10 bg-[#1b1b1b] p-5 shadow-2xl sm:max-w-lg sm:rounded-3xl sm:p-7">
      <div className="mb-5 flex items-start justify-between"><div><p className="text-xs font-bold tracking-[.18em] text-gold">{selected.status === "FREE" ? "NUEVA ASIGNACIÓN" : "DETALLE DE MESA"}</p><h2 id="table-title" className="mt-1 text-3xl font-black">MESA {selected.number}</h2></div><button onClick={() => setSelected(null)} className="min-h-11 min-w-11 rounded-full bg-white/8 text-2xl text-white/60" aria-label="Cerrar">×</button></div>
      {selected.status === "FREE" ? <>
        <label className="mb-2 block text-sm font-bold">Número de personas</label><div className="mb-6 flex items-center justify-between rounded-2xl bg-black/25 p-2"><button disabled={people <= 1} onClick={() => setPeople(n => Math.max(1, n - 1))} className="min-h-14 min-w-16 rounded-xl bg-white/10 text-3xl font-bold disabled:opacity-30">−</button><span className="text-4xl font-black tabular-nums">{people}</span><button disabled={people >= 30} onClick={() => setPeople(n => Math.min(30, n + 1))} className="min-h-14 min-w-16 rounded-xl bg-white/10 text-3xl font-bold disabled:opacity-30">+</button></div>
        <div className="mb-2 text-sm font-bold">SIGUIENTE MESERO</div><div className="mb-5 rounded-xl border border-gold/35 bg-gold/10 p-4"><div className="text-2xl font-black uppercase">{chosenEmployee ? data?.employees.find(e => e.id === chosenEmployee)?.name : data?.shift?.next?.name ?? "—"}</div><div className="mt-1 text-xs text-white/50">{chosenEmployee ? "Intervención manual · quedará al final de la rotación" : "Se moverá al final de la rotación al asignar"}</div></div>
        <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-white/45">Cambiar mesero (manual)</label><select value={chosenEmployee} onChange={e => setChosenEmployee(e.target.value)} className="mb-5 min-h-12 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm"><option value="">Usar siguiente de la rotación</option>{availableForManual.map(s => <option key={s.employeeId} value={s.employeeId}>{s.employee.name}</option>)}</select>
        <button disabled={!online || busy || !data?.shift?.next && !chosenEmployee} onClick={() => void assign()} className="min-h-14 w-full rounded-xl bg-gold text-base font-black text-black hover:bg-yellow-300 disabled:opacity-40">{busy ? "GUARDANDO…" : "ASIGNAR MESA"}</button>
      </> : <>
        {selected.assignment ? <div className="mb-5 grid grid-cols-2 gap-3"><Info label="Estado" value={statusLabel[selected.status] ?? selected.status}/><Info label="Mesero" value={selected.assignment.employee.name}/><Info label="Personas" value={String(selected.assignment.people)}/><Info label="Asignada" value={`${time(selected.assignment.assignedAt)} · ${duration(selected.assignment.assignedAt)}`}/></div> : <div className="mb-5 rounded-xl bg-sky-400/10 p-4 text-sky-100">Mesa reservada, aún sin asignación activa.</div>}
        <div className="grid grid-cols-2 gap-2">{selected.assignment && selected.status !== "BILLING" && <ActionButton onClick={() => void tableAction("BILLING")} disabled={!online || busy} yellow>POR COBRAR</ActionButton>}{selected.assignment && <ActionButton onClick={() => void tableAction("RELEASE")} disabled={!online || busy} danger>LIBERAR MESA</ActionButton>}
        {!selected.assignment && selected.status === "RESERVED" && <ActionButton onClick={() => void tableAction("FREE")} disabled={!online || busy}>LIBERAR RESERVA</ActionButton>}
        {selected.status === "FREE" && <ActionButton onClick={() => void tableAction("RESERVE")} disabled={!online || busy}>RESERVAR</ActionButton>}</div>
        {selected.assignment && <div className="mt-5 border-t border-white/10 pt-4"><label className="mb-2 block text-xs font-bold uppercase tracking-wider text-white/45">Cambiar mesero · intervención manual</label><div className="flex gap-2"><select value={chosenEmployee} onChange={e => setChosenEmployee(e.target.value)} className="min-h-12 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 text-sm"><option value="">Seleccionar mesero</option>{availableForManual.filter(s => s.employeeId !== selected.assignment?.employeeId).map(s => <option key={s.employeeId} value={s.employeeId}>{s.employee.name}</option>)}</select><button disabled={!online || busy || !chosenEmployee} onClick={() => void tableAction("TRANSFER", chosenEmployee)} className="min-h-12 rounded-xl border border-gold/40 px-4 text-xs font-black text-gold disabled:opacity-40">CAMBIAR</button></div></div>}
      </>}
    </section></div>}

    {summary && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm"><section role="dialog" aria-modal="true" className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-white/10 bg-[#1b1b1b] p-5 sm:p-7"><div className="flex items-start justify-between"><div><p className="text-xs font-bold tracking-[.18em] text-gold">TURNO CERRADO</p><h2 className="mt-1 text-2xl font-black">Resumen de Venecia</h2><p className="mt-1 text-sm text-white/45">{time(summary.shift.startedAt)} – {summary.shift.endedAt ? time(summary.shift.endedAt) : "en curso"}</p></div><button onClick={() => setSummary(null)} className="min-h-11 min-w-11 rounded-full bg-white/8 text-2xl">×</button></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3"><SummaryStat label="Mesas atendidas" value={summary.totalTables}/><SummaryStat label="Mesas abiertas" value={summary.openTables.length}/><SummaryStat label="Meseros" value={summary.staff.length}/></div><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="text-xs uppercase text-white/40"><tr><th className="py-2">Mesero</th><th>Llegada</th><th>Salida</th><th>Mesas</th><th>Clientes</th><th>Saltos</th></tr></thead><tbody>{summary.staff.map((row: any) => <tr key={row.employee.id} className="border-t border-white/8"><td className="py-3 font-bold">{row.employee.name}</td><td>{time(row.arrival)}</td><td>{row.departure ? time(row.departure) : "—"}</td><td>{row.tables}</td><td>{row.people}</td><td>{row.skips}</td></tr>)}</tbody></table></div><button onClick={() => setSummary(null)} className="mt-5 min-h-12 w-full rounded-xl bg-gold font-black text-black">LISTO</button></section></div>}

    <footer className="mt-6 flex justify-center pb-2 text-[10px] font-bold tracking-[.2em] text-white/20">FATBOY · CONTROL DE SERVICIO</footer>
  </main>;
}

function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-black/25 p-3"><div className="text-[10px] font-bold uppercase tracking-wider text-white/40">{label}</div><div className="mt-1 truncate font-bold">{value}</div></div>; }
function ActionButton({ children, onClick, disabled, yellow, danger }: { children: React.ReactNode; onClick: () => void; disabled: boolean; yellow?: boolean; danger?: boolean }) { return <button onClick={onClick} disabled={disabled} className={`min-h-12 rounded-xl px-3 text-sm font-black disabled:opacity-40 ${yellow ? "bg-gold text-black" : danger ? "border border-red-400/30 bg-red-500/10 text-red-200" : "border border-white/15 bg-white/5"}`}>{children}</button>; }
function SummaryStat({ label, value }: { label: string; value: number }) { return <div className="rounded-xl bg-black/25 p-3"><div className="text-xs text-white/45">{label}</div><div className="mt-1 text-2xl font-black">{value}</div></div>; }

