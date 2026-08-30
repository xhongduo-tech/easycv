import { NextResponse } from "next/server";
import { ensureDatabase, getDatabase } from "@/../db";

export async function GET() {
  try {
    await ensureDatabase();
    await getDatabase().prepare("SELECT 1 AS ok").first();
    return NextResponse.json({ status: "ok", database: "ready", timestamp: new Date().toISOString() });
  } catch {
    return NextResponse.json({ status: "degraded", database: "unavailable" }, { status: 503 });
  }
}
