import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import {
  adoptLegacyD1,
  inspectLegacyD1,
  planLegacySchemaAdoption,
} from "../../../../scripts/legacy-schema-adoption.mjs";

const NO_STORE_HEADERS = { "cache-control": "private, no-store" };

function isAuthorized(request) {
  const secret = env.MAINTENANCE_SECRET;
  const authorization = request.headers.get("authorization") ?? "";
  const provided = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
  if (typeof secret !== "string" || new TextEncoder().encode(secret).length < 32) return false;
  const expectedBytes = new TextEncoder().encode(secret);
  const providedBytes = new TextEncoder().encode(provided);
  let difference = expectedBytes.length ^ providedBytes.length;
  for (let index = 0; index < expectedBytes.length; index += 1) {
    difference |= expectedBytes[index] ^ (providedBytes[index] ?? 0);
  }
  return difference === 0;
}

function json(body, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

async function inspect() {
  return planLegacySchemaAdoption(await inspectLegacyD1(env.DB));
}

async function inspectPlatformMigrationLedger() {
  const tables = await env.DB.prepare(`SELECT name, sql FROM sqlite_schema
    WHERE type = 'table' AND name IN ('__appgarden_migrations', '_cf_KV')
    ORDER BY name`).all();
  const tableDefinitions = tables.results ?? [];
  if (!tableDefinitions.some((row) => row.name === "__appgarden_migrations")) {
    return { tableDefinitions };
  }
  try {
    const rows = await env.DB.prepare("SELECT * FROM __appgarden_migrations LIMIT 50").all();
    return { tableDefinitions, appgardenMigrationRows: rows.results ?? [] };
  } catch (error) {
    return {
      tableDefinitions,
      appgardenMigrationReadError: error instanceof Error ? error.message : "UnknownError",
    };
  }
}

export async function GET(request) {
  if (!isAuthorized(request)) return json({ status: "error", code: "UNAUTHORIZED" }, 401);
  try {
    return json({
      status: "ok",
      ...(await inspect()),
      platformMetadata: await inspectPlatformMigrationLedger(),
    });
  } catch (error) {
    console.error(JSON.stringify({
      event: "legacy_d1_bridge_inspection_failed",
      errorType: error instanceof Error ? error.name : "UnknownError",
    }));
    return json({ status: "error", code: "INSPECTION_FAILED" }, 500);
  }
}

export async function POST(request) {
  if (!isAuthorized(request)) return json({ status: "error", code: "UNAUTHORIZED" }, 401);
  if (new URL(request.url).searchParams.get("apply") !== "true") {
    return json({ status: "error", code: "EXPLICIT_APPLY_REQUIRED" }, 400);
  }
  try {
    return json({ status: "ok", ...(await adoptLegacyD1(env.DB)) });
  } catch (error) {
    console.error(JSON.stringify({
      event: "legacy_d1_bridge_apply_failed",
      errorType: error instanceof Error ? error.name : "UnknownError",
    }));
    return json({ status: "error", code: "ADOPTION_FAILED" }, 500);
  }
}
