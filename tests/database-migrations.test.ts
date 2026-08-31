import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CURRENT_SCHEMA_VERSION,
  DATABASE_READINESS_SQL,
  DATABASE_SCHEMA_VERSION_SQL,
  isDatabaseSchemaReady,
  maximumInitializationQueryCount,
  REQUIRED_DATABASE_TABLES,
} from "@/../db/readiness";
import { targetProfiles, templates } from "@/lib/sample-data";
import { planMigrationLedgerPrefix } from "@/../scripts/migration-ledger.mjs";

describe("database migration lifecycle", () => {
  it("builds the complete request-time schema from ordered migrations", () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec("PRAGMA foreign_keys = ON");
    applyMigrations(sqlite);

    const readiness = sqlite.prepare(DATABASE_READINESS_SQL).get() as { present_count: number };
    const schema = sqlite.prepare(DATABASE_SCHEMA_VERSION_SQL).get() as { version: number };
    expect(isDatabaseSchemaReady(readiness.present_count, schema.version)).toBe(true);
    expect(isDatabaseSchemaReady(readiness.present_count - 1, schema.version)).toBe(false);
    expect(isDatabaseSchemaReady(readiness.present_count, schema.version - 1)).toBe(false);
    expect(schema.version).toBe(CURRENT_SCHEMA_VERSION);
    expect(readiness.present_count).toBe(REQUIRED_DATABASE_TABLES.length);
    const schemaSource = readFileSync(resolve(process.cwd(), "db/schema.ts"), "utf8");
    const declaredTables = [...schemaSource.matchAll(/sqliteTable\(\s*"([^"]+)"/g)]
      .map((match) => match[1])
      .sort();
    expect([...REQUIRED_DATABASE_TABLES].sort()).toEqual(declaredTables);
    const localMigrationSource = readFileSync(
      resolve(process.cwd(), "scripts/prepare-local-d1.mjs"),
      "utf8",
    );
    expect(localMigrationSource).toContain("inspectLegacyD1");
    expect(localMigrationSource).toContain("planLegacySchemaAdoption");
    expect(localMigrationSource).toContain('"migrations"');
    expect(localMigrationSource).toContain('"apply"');
    expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it("rejects invalid direct writes at the database boundary", () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec("PRAGMA foreign_keys = ON");
    applyMigrations(sqlite);
    sqlite.exec(`
      INSERT INTO users (id, name, email, created_at, updated_at)
        VALUES ('user-1', 'User', 'user@example.com', '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z');
      INSERT INTO templates
        (id, name, description, track, accent, layout, tags_json, recommended_for_json, active, created_at, updated_at)
        VALUES ('template-1', 'Template', 'Template', 'all', '#000000', 'classic', '[]', '[]', 1,
          '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z');
    `);
    const insertResume = sqlite.prepare(`INSERT INTO resumes
      (id, user_id, title, track, target_name, template_id, status, progress, revision,
       schema_version, content_json, created_at, updated_at)
      VALUES (?, 'user-1', 'Resume', ?, 'Target', 'template-1', 'draft', ?, 1, 1, '{}',
        '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')`);
    expect(() => insertResume.run("resume-track", "other", 10)).toThrow(/resumes integrity/);
    expect(() => insertResume.run("resume-progress", "career", 101)).toThrow(/resumes integrity/);
    expect(() => sqlite.prepare(`INSERT INTO audit_events
      (id, actor_id, action, resource_type, resource_id, metadata_json, created_at)
      VALUES ('audit-1', 'user-1', 'test', 'test', 'test', 'not-json',
        '2026-09-01T00:00:00.000Z')`).run()).toThrow(/audit metadata integrity/);
    expect(() => sqlite.prepare(`INSERT INTO model_run_costs
      (request_id, user_id, model, status, input_tokens, cached_input_tokens, output_tokens,
       price_version, estimated_cost_micros, created_at)
      VALUES ('run-1', 'user-1', 'model', 'succeeded', 10, 11, 1, 'v1', 1,
        '2026-09-01T00:00:00.000Z')`).run()).toThrow(/model run cost integrity/);
    expect(() => sqlite.prepare(`INSERT INTO model_advice_deliveries
      (request_id, user_id, resume_id, request_fingerprint, response_json, attempt_state,
       updated_at, created_at, expires_at)
      VALUES ('delivery-1', 'user-1', 'resume-1', 'fingerprint', '{}', 'prepared',
        '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', '2026-09-01T00:15:00.000Z')`)
      .run()).toThrow(/model advice delivery lifecycle/);

    sqlite.prepare(`INSERT INTO model_session_leases (owner_key, request_id, expires_at)
      VALUES ('user-1', 'lifecycle:delete:test', '2999-01-01T00:00:00.000Z')`).run();
    expect(() => sqlite.prepare(`UPDATE users SET phone_number = '+8613800138000',
      phone_number_verified = 1 WHERE id = 'user-1'`).run())
      .toThrow(/identity mutation blocked by active owner lease/);
    expect(() => sqlite.prepare(`INSERT INTO auth_accounts
      (id, issuer, account_id, provider_id, user_id, created_at, updated_at)
      VALUES ('account-1', 'github', 'subject-1', 'github', 'user-1',
        '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')`).run())
      .toThrow(/identity mutation blocked by active owner lease/);
    sqlite.prepare("DELETE FROM model_session_leases WHERE owner_key = 'user-1'").run();
    sqlite.prepare(`INSERT INTO auth_accounts
      (id, issuer, account_id, provider_id, user_id, created_at, updated_at)
      VALUES ('account-1', 'github', 'subject-1', 'github', 'user-1',
        '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')`).run();
    sqlite.prepare(`INSERT INTO model_session_leases (owner_key, request_id, expires_at)
      VALUES ('user-1', 'lifecycle:delete:test-2', '2999-01-01T00:00:00.000Z')`).run();
    expect(() => sqlite.prepare("DELETE FROM auth_accounts WHERE id = 'account-1'").run())
      .toThrow(/identity mutation blocked by active owner lease/);
  });

  it("keeps cold-start initialization within the D1 Free per-request query limit", () => {
    expect(maximumInitializationQueryCount(templates.length, targetProfiles.length)).toBe(5);
    expect(maximumInitializationQueryCount(templates.length, targetProfiles.length)).toBeLessThan(50);
  });

  it("does not put schema DDL back into the request-time initializer", () => {
    const runtimeSource = readFileSync(resolve(process.cwd(), "db/index.ts"), "utf8");
    expect(runtimeSource).not.toMatch(/\bCREATE\s+(?:TABLE|INDEX)\b/i);
    expect(runtimeSource).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(runtimeSource).not.toContain("ensureAuthSchema");
  });

  it("adopts only an ordered legacy migration-ledger prefix", () => {
    const expected = ["0000.sql", "0001.sql", "0002.sql", "0003.sql", "0004.sql"];
    expect(planMigrationLedgerPrefix([], expected)).toEqual({ valid: true, missingNames: expected });
    expect(planMigrationLedgerPrefix(expected.slice(0, 2), expected)).toEqual({
      valid: true,
      missingNames: expected.slice(2),
    });
    expect(planMigrationLedgerPrefix(expected, expected)).toEqual({ valid: true, missingNames: [] });
    expect(planMigrationLedgerPrefix([expected[0], expected[2]], expected)).toEqual({
      valid: false,
      missingNames: [],
    });
    expect(planMigrationLedgerPrefix([...expected, "unknown.sql"], expected).valid).toBe(false);
  });
});

function applyMigrations(sqlite: DatabaseSync) {
  const migrationDirectory = resolve(process.cwd(), "drizzle");
  const migrations = readdirSync(migrationDirectory)
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();
  for (const migration of migrations) {
    const sql = readFileSync(resolve(migrationDirectory, migration), "utf8")
      .replaceAll("--> statement-breakpoint", "");
    sqlite.exec(sql);
  }
}
