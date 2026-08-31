import { NextResponse } from "next/server";
import { ensureDatabase, getDatabase } from "@/../db";
import { CURRENT_SCHEMA_VERSION, DATABASE_SCHEMA_VERSION_SQL } from "@/../db/readiness";

export async function GET() {
  try {
    await ensureDatabase();
    const schema = await getDatabase().prepare(DATABASE_SCHEMA_VERSION_SQL)
      .first<{ version: number }>();
    return NextResponse.json({
      status: "ok",
      database: "ready",
      schema: {
        actual: Number(schema?.version ?? 0),
        minimum: CURRENT_SCHEMA_VERSION,
        maximum: CURRENT_SCHEMA_VERSION,
      },
      timestamp: new Date().toISOString(),
    }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({
      status: "degraded",
      database: "unavailable",
      schema: { actual: null, minimum: CURRENT_SCHEMA_VERSION, maximum: CURRENT_SCHEMA_VERSION },
    }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
