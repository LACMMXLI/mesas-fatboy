"use client";

import { FormEvent, useState } from "react";
import { Icon } from "./icon";
import { Request, State, Table, avatarStyle, clockTime, elapsed, initials, tableLabel } from "./board";

type Common = { data: State; online: boolean; busy: boolean; request: Request; onClose: () => void };

function Scrim({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return <div className="scrim" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>{children}</div>;
}

export function TableSheet({ table, data, online, busy, request, onClose }: Common & { table: Table }) {
  const [people, setPeople] = useState(2);
  const [chosen, setChosen] = useState("");
  const disabled = !online || busy;
  const assignment = table.assignment;
  const available = (data.shift?.staff ?? []).filter(member => !member.leftAt && member.status === "AVAILABLE");
  const next = data.shift?.next;
  const chosenName = data.employees.find(employee => employee.id === chosen)?.name;
  const assignee = chosenName ?? next?.name;

  async function act(action: string, employeeId?: string) {
    if (action === "RELEASE" && !window.confirm(`¿Liberar la mesa ${table.number}?`)) return;
    if (await request({ type: "table", tableId: table.id, action, employeeId })) onClose();
  }

  return <Scrim onClose={onClose}>
    <section role="dialog" aria-modal="true" aria-labelledby="table-title" className="sheet table-sheet" data-s={table.status}>
      <header className="tsheet-head">
        <div><span className="tsheet-kicker">Mesa</span><h2 id="table-title">{table.number}</h2></div>
        <span className="pill">{tableLabel[table.status]}</span>
        <button className="icon-btn on-tone" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button>
      </header>

      <div className="sheet-body">
        {table.status === "FREE" ? <>
          <div className="assign-grid">
            <div className="assign-col">
              <div className="field-label">¿Cuántas personas?</div>
              <div className="stepper">
                <button disabled={people <= 1} onClick={() => setPeople(n => Math.max(1, n - 1))} aria-label="Menos personas"><Icon name="minus" size={26} /></button>
                <output><b>{people}</b><span>{people === 1 ? "persona" : "personas"}</span></output>
                <button disabled={people >= 30} onClick={() => setPeople(n => Math.min(30, n + 1))} aria-label="Más personas"><Icon name="plus" size={26} /></button>
              </div>
            </div>
            <div className="assign-col">
              <div className="field-label">Mesero</div>
              <div className="assignee">
                {assignee ? <span className="avatar lg" style={avatarStyle(assignee)}>{initials(assignee)}</span> : <span className="avatar lg empty-avatar">?</span>}
                <div><small>{chosen ? "Elegido a mano" : "Le toca a"}</small><strong>{assignee ?? "Nadie disponible"}</strong></div>
              </div>
              {available.length > 1 && <select className="select" value={chosen} onChange={event => setChosen(event.target.value)} aria-label="Elegir otro mesero">
                <option value="">Seguir la rotación</option>
                {available.map(member => <option key={member.employeeId} value={member.employeeId}>{member.employee.name}</option>)}
              </select>}
            </div>
          </div>
          {!assignee && <p className="hint">{data.shift ? "Marca la llegada de un mesero disponible para poder asignar." : "Abre el turno desde Asistencia para poder asignar."}</p>}

          <button className="btn btn-primary btn-xl" disabled={disabled || !assignee} onClick={async () => { if (await request({ type: "assign", tableId: table.id, people, ...(chosen ? { employeeId: chosen } : {}) })) onClose(); }}>{busy ? "Guardando…" : `Asignar mesa ${table.number}`}</button>
          <div className="row-actions">
            <button className="btn btn-ghost" disabled={disabled} onClick={() => void act("RESERVE")}><Icon name="bookmark" size={18} /> Reservar</button>
            <button className="btn btn-danger" disabled={disabled} onClick={async () => { if (window.confirm(`¿Eliminar la mesa ${table.number}?`) && await request({ type: "deleteTable", tableId: table.id })) onClose(); }}><Icon name="trash" size={18} /> Eliminar</button>
          </div>
        </> : <>
          {assignment ? <div className="facts">
            <div><small>Mesero</small><strong>{assignment.employee.name}</strong></div>
            <div><small>Personas</small><strong>{assignment.people}</strong></div>
            <div><small>Desde</small><strong>{clockTime(assignment.assignedAt)}</strong></div>
            <div><small>Tiempo</small><strong>{elapsed(assignment.assignedAt)}</strong></div>
          </div> : <p className="hint">Mesa reservada. Todavía no tiene mesero.</p>}

          <div className="row-actions">
            {assignment && table.status !== "BILLING" && <button className="btn btn-primary" disabled={disabled} onClick={() => void act("BILLING")}><Icon name="receipt" size={18} /> Pedir cuenta</button>}
            {assignment && <button className="btn btn-danger" disabled={disabled} onClick={() => void act("RELEASE")}>Liberar mesa</button>}
            {!assignment && table.status === "RESERVED" && <button className="btn btn-primary" disabled={disabled} onClick={() => void act("FREE")}>Quitar reserva</button>}
          </div>

          {assignment && <>
            <div className="field-label">Pasar la mesa a otro mesero</div>
            <div className="inline">
              <select className="select" value={chosen} onChange={event => setChosen(event.target.value)}>
                <option value="">Elegir mesero</option>
                {available.filter(member => member.employeeId !== assignment.employeeId).map(member => <option key={member.employeeId} value={member.employeeId}>{member.employee.name}</option>)}
              </select>
              <button className="btn btn-ghost" disabled={disabled || !chosen} onClick={() => void act("TRANSFER", chosen)}><Icon name="swap" size={18} /> Pasar</button>
            </div>
          </>}
        </>}
      </div>
    </section>
  </Scrim>;
}

export function StaffSheet({ data, online, busy, request, onClose }: Common) {
  const [name, setName] = useState("");
  const disabled = !online || busy;
  async function add(event: FormEvent) { event.preventDefault(); if (await request({ type: "addEmployee", name })) setName(""); }
  return <Scrim onClose={onClose}>
    <section role="dialog" aria-modal="true" aria-labelledby="staff-title" className="sheet manage">
      <header className="manage-head"><h2 id="staff-title">Meseros</h2><button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button></header>
      <form onSubmit={add} className="inline"><input className="input" value={name} onChange={event => setName(event.target.value)} maxLength={60} placeholder="Nombre del mesero" aria-label="Nombre del mesero" /><button className="btn btn-primary" disabled={disabled || name.trim().length < 2}><Icon name="plus" size={18} /> Agregar</button></form>
      <ul className="people">
        {data.employees.map(employee => <li key={employee.id} data-off={!employee.active}>
          <span className="avatar" style={avatarStyle(employee.name)}>{initials(employee.name)}</span>
          <span className="people-name">{employee.name}{!employee.active && <em>Inactivo</em>}</span>
          {employee.active
            ? <button className="btn btn-ghost btn-sm" disabled={disabled} onClick={() => window.confirm(`¿Quitar a ${employee.name}? Si tiene historial, se conserva como inactivo.`) && void request({ type: "deleteEmployee", employeeId: employee.id })}>Quitar</button>
            : <>
              <button className="btn btn-ghost btn-sm" disabled={disabled} onClick={() => void request({ type: "toggleEmployee", employeeId: employee.id })}>Reactivar</button>
              <button className="btn btn-danger btn-sm" disabled={disabled} onClick={() => window.confirm(`¿Borrar a ${employee.name}? Si tiene historial, no se podrá borrar.`) && void request({ type: "deleteEmployee", employeeId: employee.id })}>Borrar</button>
            </>}
        </li>)}
      </ul>
      {data.employees.length === 0 && <div className="empty">Todavía no hay meseros. Escribe un nombre y agrégalo.</div>}
    </section>
  </Scrim>;
}

export function TablesSheet({ data, online, busy, request, onClose }: Common) {
  const [number, setNumber] = useState("");
  const disabled = !online || busy;
  async function add(event: FormEvent) { event.preventDefault(); if (await request({ type: "addTable", number: Number(number) })) setNumber(""); }
  return <Scrim onClose={onClose}>
    <section role="dialog" aria-modal="true" aria-labelledby="tables-title" className="sheet manage">
      <header className="manage-head"><h2 id="tables-title">Mesas del salón</h2><button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button></header>
      <form onSubmit={add} className="inline"><input className="input" type="number" inputMode="numeric" min={1} max={999} step={1} required value={number} onChange={event => setNumber(event.target.value)} placeholder="Número de mesa" aria-label="Número de mesa" /><button className="btn btn-primary" disabled={disabled || !number}><Icon name="plus" size={18} /> Agregar</button></form>
      <ul className="table-chips">
        {data.tables.map(table => <li key={table.id}><b>{table.number}</b><button disabled={disabled || Boolean(table.assignment)} title={table.assignment ? "Libera la mesa para eliminarla" : `Eliminar mesa ${table.number}`} aria-label={`Eliminar mesa ${table.number}`} onClick={() => window.confirm(`¿Eliminar la mesa ${table.number}?`) && void request({ type: "deleteTable", tableId: table.id })}><Icon name="close" size={14} /></button></li>)}
      </ul>
      {data.tables.length === 0 && <div className="empty">Agrega las mesas de Roma para empezar.</div>}
    </section>
  </Scrim>;
}

export function SummarySheet({ summary, onClose }: { summary: any; onClose: () => void }) {
  return <Scrim onClose={onClose}>
    <section role="dialog" aria-modal="true" aria-labelledby="sum-title" className="sheet manage wide">
      <header className="manage-head"><div><h2 id="sum-title">Turno cerrado</h2><p className="sub">{clockTime(summary.shift.startedAt)} a {summary.shift.endedAt ? clockTime(summary.shift.endedAt) : "en curso"}</p></div><button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button></header>
      <div className="stats"><div><b>{summary.totalTables}</b><span>mesas atendidas</span></div><div><b>{summary.openTables.length}</b><span>quedaron abiertas</span></div><div><b>{summary.staff.length}</b><span>meseros</span></div></div>
      <div className="table-scroll"><table className="report"><thead><tr><th>Mesero</th><th>Llegó</th><th>Salió</th><th>Mesas</th><th>Clientes</th><th>Saltos</th></tr></thead><tbody>
        {summary.staff.map((row: any) => <tr key={row.employee.id}><td><span className="avatar sm" style={avatarStyle(row.employee.name)}>{initials(row.employee.name)}</span>{row.employee.name}</td><td>{clockTime(row.arrival)}</td><td>{row.departure ? clockTime(row.departure) : "—"}</td><td>{row.tables}</td><td>{row.people}</td><td>{row.skips}</td></tr>)}
      </tbody></table></div>
      <button className="btn btn-primary btn-xl" onClick={onClose}>Listo</button>
    </section>
  </Scrim>;
}
