import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import assert from "node:assert/strict";
import {
  CREATE_MIGRATION_LEDGER_SQL,
  LEGACY_MIGRATIONS,
  adoptLegacyD1,
  buildLedgerInsertSql,
  planLegacySchemaAdoption,
} from "./legacy-schema-adoption.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publishedMigrationHashes = {
  "0000_silly_thanos.sql": "82dddd17e48084be920101214a1c3f6709e1697cfd312b16e5594be0e1cea450",
  "0001_catalog_meta.sql": "ac58572c44764658eed6d533e9717fdf930a0fb8b4d815c61b82a8246a252160",
  "0002_model_usage_guards.sql": "5a4c2ab221973b785e708208561737b7621c482df25aad089b9df3769cfcfbe2",
  "0003_resume_target_briefs.sql": "ed104644e7a68e727221a03efae8ca697b1cae812a31e45bfef8b19822197ef6",
  "0004_complete_auth.sql": "0413adaeeecad11f67a220819763d798f2e0b31bafaa9b4f15f1c29ac906ac93",
};

for (const [migration, expectedHash] of Object.entries(publishedMigrationHashes)) {
  const source = readFileSync(`${projectRoot}/drizzle/${migration}`);
  assert.equal(createHash("sha256").update(source).digest("hex"), expectedHash);
}

function applyLegacyMigrations(db) {
  for (const migration of LEGACY_MIGRATIONS) {
    const source = readFileSync(`${projectRoot}/drizzle/${migration}`, "utf8")
      .replaceAll("--> statement-breakpoint", "");
    db.exec(source);
  }
}

function snapshot(db) {
  const tableRows = db.prepare(`SELECT name FROM sqlite_schema
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all();
  const columnRows = db.prepare(`SELECT m.name AS table_name, c.*
    FROM sqlite_schema AS m JOIN pragma_table_info(m.name) AS c
    WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%'
    ORDER BY m.name, c.cid`).all();
  const indexRows = db.prepare(`SELECT m.name AS table_name, il.name AS index_name,
      il."unique", il.origin, il.partial, ii.seqno, ii.name AS column_name
    FROM sqlite_schema AS m
    JOIN pragma_index_list(m.name) AS il
    JOIN pragma_index_info(il.name) AS ii
    WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%'
    ORDER BY m.name, il.name, ii.seqno`).all();
  const foreignKeyRows = db.prepare(`SELECT m.name AS table_name, fk."table" AS to_table,
      fk."from", fk."to", fk.on_update, fk.on_delete, fk.match
    FROM sqlite_schema AS m JOIN pragma_foreign_key_list(m.name) AS fk
    WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%'
    ORDER BY m.name, fk.id, fk.seq`).all();
  const hasLedger = tableRows.some((row) => row.name === "d1_migrations");
  return {
    tableRows,
    columnRows,
    indexRows,
    foreignKeyRows,
    ledgerRows: hasLedger
      ? db.prepare("SELECT id, name, applied_at FROM d1_migrations ORDER BY id").all()
      : [],
    invalidUpdatedAtCount: db.prepare(`SELECT COUNT(*) AS count FROM users
      WHERE updated_at IS NULL OR trim(updated_at) = ''`).get().count,
    foreignKeyViolationCount: db.prepare("SELECT COUNT(*) AS count FROM pragma_foreign_key_check").get().count,
  };
}

function createLegacyDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  applyLegacyMigrations(db);
  return db;
}

function asD1(sqlite) {
  const makeStatement = (sql, values = []) => ({
    bind: (...nextValues) => makeStatement(sql, nextValues),
    all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
    run: async () => {
      const result = sqlite.prepare(sql).run(...values);
      return { success: true, meta: { changes: result.changes } };
    },
    execute: () => {
      const prepared = sqlite.prepare(sql);
      if (/^\s*(SELECT|PRAGMA)/i.test(sql)) return { results: prepared.all(...values) };
      const result = prepared.run(...values);
      return { success: true, results: [], meta: { changes: result.changes } };
    },
  });
  return {
    prepare: (sql) => makeStatement(sql),
    batch: async (statements) => {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map((statement) => statement.execute());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

for (const prefixLength of [0, 2, 5]) {
  const db = createLegacyDb();
  if (prefixLength > 0) {
    db.exec(CREATE_MIGRATION_LEDGER_SQL);
    const names = LEGACY_MIGRATIONS.slice(0, prefixLength);
    db.prepare(buildLedgerInsertSql(names.length)).run(...names);
  }
  const plan = await planLegacySchemaAdoption(snapshot(db));
  assert.equal(plan.state, prefixLength === 5 ? "already_baselined" : "adoptable");
  assert.deepEqual(plan.missingNames, LEGACY_MIGRATIONS.slice(prefixLength));
}

{
  const empty = new DatabaseSync(":memory:");
  const result = await adoptLegacyD1(asD1(empty));
  assert.equal(result.state, "fresh");
  assert.equal(
    empty.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE name = 'd1_migrations'").get().count,
    0,
  );
}

{
  const db = createLegacyDb();
  db.prepare(`INSERT INTO users
    (id, name, email, role, created_at, email_verified, updated_at, banned, phone_number_verified)
    VALUES ('preserved-user', 'Before bridge', 'before@example.com', 'user',
      '2026-01-01T00:00:00.000Z', 1, '2026-01-01T00:00:00.000Z', 0, 0)`).run();
  assert.equal((await adoptLegacyD1(asD1(db))).state, "adopted");
  for (const migration of [
    "0005_ai_credits_pricing.sql",
    "0006_model_advice_deliveries.sql",
    "0007_schema_readiness.sql",
    "0008_admin_two_factor.sql",
    "0009_signup_promo_redemptions.sql",
    "0010_ai_request_lifecycle.sql",
    "0011_integrity_constraints.sql",
  ]) {
    db.exec(readFileSync(`${projectRoot}/drizzle/${migration}`, "utf8")
      .replaceAll("--> statement-breakpoint", ""));
    db.prepare("INSERT INTO d1_migrations (name) VALUES (?)").run(migration);
  }
  assert.deepEqual(
    { ...db.prepare("SELECT id, name, email FROM users WHERE id = 'preserved-user'").get() },
    { id: "preserved-user", name: "Before bridge", email: "before@example.com" },
  );
  assert.equal(
    db.prepare("SELECT version FROM app_schema_meta WHERE key = 'app'").get().version,
    11,
  );
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
}

for (const prefixLength of [0, 2, 5]) {
  const db = createLegacyDb();
  if (prefixLength > 0) {
    db.exec(CREATE_MIGRATION_LEDGER_SQL);
    const names = LEGACY_MIGRATIONS.slice(0, prefixLength);
    db.prepare(buildLedgerInsertSql(names.length)).run(...names);
  }
  const result = await adoptLegacyD1(asD1(db));
  assert.equal(result.state, prefixLength === 5 ? "already_baselined" : "adopted");
  assert.deepEqual(
    db.prepare("SELECT name FROM d1_migrations ORDER BY id").all().map((row) => row.name),
    LEGACY_MIGRATIONS,
  );
}

{
  const db = createLegacyDb();
  db.exec(CREATE_MIGRATION_LEDGER_SQL);
  db.prepare(buildLedgerInsertSql(2)).run(LEGACY_MIGRATIONS[0], LEGACY_MIGRATIONS[2]);
  assert.equal((await planLegacySchemaAdoption(snapshot(db))).state, "refused");
}

{
  const db = createLegacyDb();
  db.exec("CREATE TABLE d1_migrations (name TEXT)");
  const result = await adoptLegacyD1(asD1(db));
  assert.equal(result.state, "refused");
  assert.equal(result.reason, "invalid_migration_ledger_schema");
}

{
  const db = createLegacyDb();
  db.exec("CREATE TABLE _cf_METADATA (key TEXT PRIMARY KEY, value BLOB)");
  const result = await planLegacySchemaAdoption(snapshot(db));
  assert.equal(result.state, "adoptable");
}

{
  const db = createLegacyDb();
  db.exec("DROP TABLE auth_rate_limits");
  assert.equal((await planLegacySchemaAdoption(snapshot(db))).state, "refused");
}

{
  const db = createLegacyDb();
  db.exec("DROP INDEX idx_users_phone_number");
  const result = await planLegacySchemaAdoption(snapshot(db));
  assert.equal(result.state, "refused");
  assert.equal(result.reason, "legacy_schema_fingerprint_mismatch");
}

console.log("migration bridge design checks passed");
