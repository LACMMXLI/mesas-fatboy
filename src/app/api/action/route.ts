import { NextRequest, NextResponse } from "next/server";
import { addEmployee, addTable, arrive, assignTable, closeShift, OperationError, saveRotation, setAvailability, startShift, tableAction, skipNext, toggleEmployee } from "@/lib/operations";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") throw new OperationError("Solicitud inválida.");
    const branchId = typeof body.branchId === "string" ? body.branchId : "";
    let result: unknown;
    switch (body.type) {
      case "start": result = await startShift(branchId); break;
      case "arrive": result = await arrive(branchId, String(body.employeeId || "")); break;
      case "availability":
        if (!["BREAK", "EATING", "RESUME", "LEAVE"].includes(body.action)) throw new OperationError("Acción de mesero no válida.");
        result = await setAvailability(branchId, String(body.employeeId || ""), body.action); break;
      case "assign": result = await assignTable(branchId, String(body.tableId || ""), Number(body.people), body.employeeId ? String(body.employeeId) : undefined); break;
      case "table":
        if (!["BILLING", "RELEASE", "RESERVE", "FREE", "TRANSFER"].includes(body.action)) throw new OperationError("Acción de mesa no válida.");
        result = await tableAction(branchId, String(body.tableId || ""), body.action, body.employeeId ? String(body.employeeId) : undefined); break;
      case "rotation":
        if (!Array.isArray(body.employeeIds) || body.employeeIds.some((id: unknown) => typeof id !== "string")) throw new OperationError("Orden de rotación no válida.");
        result = await saveRotation(branchId, body.employeeIds); break;
      case "skip": result = await skipNext(branchId); break;
      case "close": result = await closeShift(branchId); break;
      case "addEmployee": result = await addEmployee(branchId, String(body.name || "")); break;
      case "addTable": result = await addTable(branchId, Number(body.number)); break;
      case "toggleEmployee": {
        result = await toggleEmployee(branchId, String(body.employeeId || ""));
        break;
      }
      default: throw new OperationError("Acción desconocida.");
    }
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    let status = error instanceof OperationError ? error.status : 500;
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") status = 409;
    const message = error instanceof Error ? error.message : "Error de servidor.";
    return NextResponse.json({ error: message }, { status });
  }
}
