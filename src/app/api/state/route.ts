import { NextRequest, NextResponse } from "next/server";
import { getSnapshot, OperationError } from "@/lib/operations";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const state = await getSnapshot(request.nextUrl.searchParams.get("branch") || "roma");
    return NextResponse.json(state, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    const status = error instanceof OperationError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error de servidor." }, { status });
  }
}
