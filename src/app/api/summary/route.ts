import { NextRequest, NextResponse } from "next/server";
import { OperationError, shiftSummary } from "@/lib/operations";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const branchId = request.nextUrl.searchParams.get("branchId");
    const shiftId = request.nextUrl.searchParams.get("shiftId");
    if (!branchId || !shiftId) throw new OperationError("Falta la sucursal o el turno.");
    return NextResponse.json(await shiftSummary(branchId, shiftId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof OperationError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error de servidor." }, { status });
  }
}
