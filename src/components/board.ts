export type Employee = { id: string; name: string; active: boolean };
export type Staff = { id: string; employeeId: string; employee: Employee; arrivalOrder: number; arrivedAt: string; leftAt: string | null; status: string; displayStatus: string };
export type Assignment = { id: string; employeeId: string; employee: Employee; people: number; assignedAt: string; status: string };
export type Table = { id: string; number: number; status: string; assignment: Assignment | null };
export type RotationItem = { id: string; employee: Employee; shiftEmployeeId: string; skips: number };
export type State = {
  branch: { id: string; name: string; slug: string };
  tables: Table[];
  employees: Employee[];
  shift: null | { id: string; startedAt: string; staff: Staff[]; rotation: RotationItem[]; next: Employee | null };
};
export type Request = (payload: Record<string, unknown>) => Promise<boolean>;

export const tableLabel: Record<string, string> = { FREE: "Libre", OCCUPIED: "Ocupada", BILLING: "Por cobrar", RESERVED: "Reservada" };
export const staffLabel: Record<string, string> = { AVAILABLE: "Disponible", SERVING: "Atendiendo", BREAK: "En descanso", EATING: "Comiendo", OUT: "Fuera" };

export const clockTime = (date: string | Date) => new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" }).format(new Date(date));

export function elapsed(date: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Stable colour per person so a waiter looks the same everywhere in the app. */
export function avatarStyle(name: string): React.CSSProperties {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return { background: `hsl(${hash} 78% 70%)`, color: `hsl(${hash} 55% 14%)` };
}
