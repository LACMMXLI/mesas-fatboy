"use client";

import { Icon } from "./icon";
import { Request, State, Staff, avatarStyle, clockTime, initials, staffLabel } from "./board";

type Props = {
  data: State;
  online: boolean;
  busy: boolean;
  request: Request;
  onArrive: (employeeId: string) => void;
  onClose: () => void;
};

const RING = 2 * Math.PI * 27;

export function Attendance({ data, online, busy, request, onArrive, onClose }: Props) {
  const staff = data.shift?.staff ?? [];
  const byEmployee = new Map(staff.map(member => [member.employeeId, member]));
  const roster = data.employees.filter(employee => employee.active || byEmployee.has(employee.id));
  const present = staff.filter(member => !member.leftAt).length;
  const expected = roster.filter(employee => byEmployee.get(employee.id)?.leftAt == null).length;
  const disabled = !online || busy;

  function leave(member: Staff) {
    if (window.confirm(`¿Registrar la salida de ${member.employee.name}? Ya no volverá a la rotación de este turno.`)) void request({ type: "availability", employeeId: member.employeeId, action: "LEAVE" });
  }

  return <div className="scrim" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="att-title" className="sheet att">
      <header className="att-head">
        <div className="ring" aria-label={`${present} de ${expected} presentes`}>
          <svg viewBox="0 0 64 64" width="64" height="64"><circle cx="32" cy="32" r="27" className="ring-track" /><circle cx="32" cy="32" r="27" className="ring-fill" strokeDasharray={RING} strokeDashoffset={RING * (1 - (expected ? present / expected : 0))} /></svg>
          <b>{present}<i>/{expected}</i></b>
        </div>
        <div className="att-title">
          <h2 id="att-title">Pase de lista</h2>
          <p>{data.shift ? "Toca tu nombre cuando llegues. El orden en que tocan es el orden de la rotación." : "Toca el primer nombre para abrir el turno y marcar su llegada."}</p>
        </div>
        <button className="btn btn-primary" onClick={onClose}>Listo</button>
      </header>

      {roster.length === 0 ? <div className="empty">Aún no hay meseros. Agrégalos desde el botón <b>Meseros</b>.</div> : <ul className="tiles">
        {roster.map(employee => {
          const member = byEmployee.get(employee.id);
          const state = member ? member.displayStatus : "ABSENT";
          const off = state === "OUT";
          return <li key={employee.id} className="tile" data-s={state}>
            {member ? <div className="tile-face">
              <span className="avatar xl" style={avatarStyle(employee.name)}>{initials(employee.name)}</span>
              <span className="tile-name">{employee.name}</span>
              <span className="tile-sub">{off ? `Salió ${member.leftAt ? clockTime(member.leftAt) : ""}` : `${staffLabel[state] ?? state} · llegó ${clockTime(member.arrivedAt)}`}</span>
              {!off && <span className="tile-order" title="Orden de llegada">{member.arrivalOrder + 1}</span>}
            </div> : <button className="tile-face tile-tap" disabled={disabled} onClick={() => onArrive(employee.id)}>
              <span className="avatar xl" style={avatarStyle(employee.name)}>{initials(employee.name)}</span>
              <span className="tile-name">{employee.name}</span>
              <span className="tile-sub"><Icon name="check" size={14} /> Marcar llegada</span>
            </button>}
            {member && !off && <div className="tile-actions">
              {state === "BREAK" || state === "EATING"
                ? <button className="chip chip-wide" disabled={disabled} onClick={() => void request({ type: "availability", employeeId: member.employeeId, action: "RESUME" })}><Icon name="undo" size={16} /> Volver al turno</button>
                : <>
                  <button className="chip" disabled={disabled || state === "SERVING"} title={state === "SERVING" ? "Tiene mesas abiertas" : undefined} onClick={() => void request({ type: "availability", employeeId: member.employeeId, action: "BREAK" })}><Icon name="coffee" size={16} /> Descanso</button>
                  <button className="chip" disabled={disabled || state === "SERVING"} title={state === "SERVING" ? "Tiene mesas abiertas" : undefined} onClick={() => void request({ type: "availability", employeeId: member.employeeId, action: "EATING" })}><Icon name="fork" size={16} /> Comida</button>
                </>}
              <button className="chip chip-out" disabled={disabled || state === "SERVING"} title={state === "SERVING" ? "Tiene mesas abiertas" : "Registrar salida"} onClick={() => leave(member)} aria-label={`Registrar salida de ${employee.name}`}><Icon name="door" size={16} /></button>
            </div>}
          </li>;
        })}
      </ul>}
    </section>
  </div>;
}
