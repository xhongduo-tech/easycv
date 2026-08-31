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

async function inspectLegacyDataInvariants() {
  const checks = [
    ["resumes", `SELECT COUNT(*) AS count FROM resumes WHERE
      track NOT IN ('study','career') OR status NOT IN ('draft','ready','archived')
      OR typeof(progress) <> 'integer' OR progress < 0 OR progress > 100
      OR typeof(revision) <> 'integer' OR revision < 1 OR schema_version <> 1
      OR length(trim(title)) < 1 OR length(title) > 160
      OR length(trim(target_name)) < 1 OR length(target_name) > 240
      OR json_valid(content_json) = 0 OR length(content_json) > 600000
      OR (deleted_at IS NOT NULL AND status <> 'archived')`],
    ["resumeTargetBriefs", `SELECT COUNT(*) AS count FROM resume_target_briefs WHERE
      kind NOT IN ('career-job','study-program')
      OR source_type NOT IN ('employer-official','boss','zhaopin','other-platform','manual')
      OR typeof(revision) <> 'integer' OR revision < 1
      OR length(trim(focus_name)) < 1 OR length(focus_name) > 160
      OR length(requirements_text) > 12000
      OR (source_url IS NOT NULL AND source_url <> ''
        AND source_url NOT LIKE 'http://%' AND source_url NOT LIKE 'https://%')`],
    ["resumeVersions", `SELECT COUNT(*) AS count FROM resume_versions WHERE
      typeof(revision) <> 'integer' OR revision < 1
      OR json_valid(content_json) = 0 OR length(content_json) > 600000`],
    ["suggestionEvents", `SELECT COUNT(*) AS count FROM suggestion_events WHERE
      section NOT IN ('overview','basics','summary','experience','education','projects','extras')
      OR typeof(score) <> 'integer' OR score < 0 OR score > 100`],
    ["guestSessions", "SELECT COUNT(*) AS count FROM guest_sessions WHERE expires_at <= created_at"],
    ["auditEvents", `SELECT COUNT(*) AS count FROM audit_events WHERE
      json_valid(metadata_json) = 0
      OR CASE WHEN json_valid(metadata_json) = 1 THEN json_type(metadata_json) <> 'object' ELSE 1 END`],
    ["modelProviderState", `SELECT COUNT(*) AS count FROM model_provider_state WHERE
      typeof(consecutive_failures) <> 'integer' OR consecutive_failures < 0`],
  ];
  const results = await env.DB.batch(checks.map(([, sql]) => env.DB.prepare(sql)));
  const violations = Object.fromEntries(checks.map(([name], index) => [
    name,
    Number(results[index]?.results?.[0]?.count ?? 0),
  ]));
  return {
    violations,
    total: Object.values(violations).reduce((sum, count) => sum + count, 0),
  };
}

export async function GET(request) {
  if (!isAuthorized(request)) return json({ status: "error", code: "UNAUTHORIZED" }, 401);
  try {
    return json({
      status: "ok",
      ...(await inspect()),
      platformMetadata: await inspectPlatformMigrationLedger(),
      legacyDataInvariants: await inspectLegacyDataInvariants(),
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
