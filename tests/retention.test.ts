import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { getDatabase } from "@/../db";
import { maximumInitializationQueryCount } from "@/../db/readiness";
import { targetProfiles, templates } from "@/lib/sample-data";
import {
  RETENTION_MAINTENANCE_STATEMENT_BUDGET,
  runRetentionMaintenance,
} from "@/lib/retention";

type Database = ReturnType<typeof getDatabase>;
const NOW = new Date("2026-09-01T00:30:00.000Z");

describe("retention maintenance", () => {
  it("is a dry-run by default and applies bounded lifecycle cleanup explicitly", async () => {
    const adapter = createDatabase();
    const db = adapter as unknown as Database;
    seedModelLifecycle(adapter.sqlite);

    const preview = await runRetentionMaintenance(db, { now: NOW });
    expect(preview).toMatchObject({
      dryRun: true,
      adviceBodiesDue: 1,
      pendingAttemptsDue: 1,
      adviceTombstonesDue: 1,
      modelCostsDue: 2,
      promoRedemptionsDue: 1,
    });
    expect(adapter.sqlite.prepare(`SELECT status FROM ai_credit_ledger
      WHERE request_id = 'pending-request'`).get()).toEqual({ status: "reserved" });

    const applied = await runRetentionMaintenance(db, { apply: true, now: NOW });
    expect(applied).toMatchObject({
      dryRun: false,
      recoveredPendingAttempts: 1,
      adviceBodiesErased: 1,
      adviceTombstonesDeleted: 1,
      modelCostsDeleted: 2,
      promoRedemptionsDeleted: 1,
    });
    expect(adapter.sqlite.prepare("SELECT remaining_credits FROM ai_credit_lots").get())
      .toEqual({ remaining_credits: 5 });
    expect(adapter.sqlite.prepare(`SELECT status, release_reason FROM ai_credit_ledger
      WHERE request_id = 'pending-request'`).get()).toEqual({
      status: "released",
      release_reason: "pending-expired",
    });
    expect(adapter.sqlite.prepare(`SELECT response_json, attempt_state FROM model_advice_deliveries
      WHERE request_id = 'pending-request'`).get()).toEqual({
      response_json: "{}",
      attempt_state: "expired",
    });
    expect(adapter.sqlite.prepare(`SELECT response_json, attempt_state FROM model_advice_deliveries
      WHERE request_id = 'terminal-request'`).get()).toEqual({
      response_json: "{}",
      attempt_state: "expired",
    });
    expect(adapter.sqlite.prepare(`SELECT request_id FROM model_advice_deliveries
      WHERE request_id = 'old-tombstone'`).get()).toBeUndefined();
    expect(adapter.sqlite.prepare("SELECT request_id FROM model_run_costs WHERE request_id = 'old-cost'").get())
      .toBeUndefined();
    expect(adapter.sqlite.prepare("SELECT request_id FROM model_run_costs WHERE request_id = 'ancient-cost'").get())
      .toBeUndefined();
    expect(adapter.sqlite.prepare("SELECT identity_hash FROM signup_promo_redemptions ORDER BY identity_hash").all())
      .toEqual([{ identity_hash: "b".repeat(64) }]);
  });

  it("never purges an expired guest while a session is still active", async () => {
    const adapter = createDatabase();
    const db = adapter as unknown as Database;
    insertUser(adapter.sqlite, "guest-active", "2026-08-01T00:00:00.000Z");
    insertUser(adapter.sqlite, "guest-expired", "2026-08-01T00:00:00.000Z");
    adapter.sqlite.exec(`
      INSERT INTO guest_sessions (token_hash, user_id, expires_at, created_at) VALUES
        ('active-token', 'guest-active', '2026-09-02T00:00:00.000Z', '2026-08-01T00:00:00.000Z'),
        ('expired-token', 'guest-expired', '2026-08-20T00:00:00.000Z', '2026-08-01T00:00:00.000Z');
      INSERT INTO model_run_costs
        (request_id, user_id, model, status, price_version, created_at)
        VALUES ('guest-running-cost', 'guest-expired', 'deepseek-v4-flash', 'running', 'v1',
          '2026-08-20T00:00:00.000Z');
    `);

    const result = await runRetentionMaintenance(db, { apply: true, now: NOW });
    expect(result).toMatchObject({ dryRun: false, expiredGuestsPurged: 1 });
    expect(adapter.sqlite.prepare("SELECT id FROM users WHERE id = 'guest-active'").get())
      .toEqual({ id: "guest-active" });
    expect(adapter.sqlite.prepare("SELECT id FROM users WHERE id = 'guest-expired'").get())
      .toBeUndefined();
    expect(adapter.sqlite.prepare(`SELECT user_id, status, failure_kind, settled_at
      FROM model_run_costs WHERE request_id = 'guest-running-cost'`).get()).toMatchObject({
      user_id: "expired-guest-guest-running-cost",
      status: "failed",
      failure_kind: "guest-expired",
      settled_at: NOW.toISOString(),
    });
  });

  it("never purges an expired guest while a model owner lease is active", async () => {
    const adapter = createDatabase();
    const db = adapter as unknown as Database;
    insertUser(adapter.sqlite, "guest-model-active", "2026-08-01T00:00:00.000Z");
    adapter.sqlite.exec(`INSERT INTO model_session_leases (owner_key, request_id, expires_at)
      VALUES ('guest-model-active', 'active-request', '2026-09-01T00:31:00.000Z')`);

    const result = await runRetentionMaintenance(db, { apply: true, now: NOW });

    expect(result).toMatchObject({ dryRun: false, expiredGuestsPurged: 0 });
    expect(adapter.sqlite.prepare("SELECT id FROM users WHERE id = 'guest-model-active'").get())
      .toEqual({ id: "guest-model-active" });
  });

  it("stays within D1's bind limit at the maximum maintenance batch sizes", async () => {
    const adapter = createDatabase();
    const db = adapter as unknown as Database;
    insertUser(adapter.sqlite, "user-retained", "2026-08-01T00:00:00.000Z");
    adapter.sqlite.exec(`INSERT INTO templates
      (id, name, description, track, accent, layout, tags_json, recommended_for_json, active, created_at, updated_at)
      VALUES ('template-test', 'Test', 'Test', 'study', '#000000', 'classic', '[]', '[]', 1,
        '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')`);
    const resumeInsert = adapter.sqlite.prepare(`INSERT INTO resumes
      (id, user_id, title, track, target_name, template_id, status, progress, revision,
       schema_version, content_json, created_at, updated_at, deleted_at)
      VALUES (?, 'user-retained', 'Old', 'study', 'Target', 'template-test', 'archived', 0, 1,
        1, '{}', '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z')`);
    for (let index = 0; index < 100; index += 1) resumeInsert.run(`resume-old-${index}`);
    for (let index = 0; index < 50; index += 1) {
      insertUser(adapter.sqlite, `guest-batch-${index}`, "2026-08-01T00:00:00.000Z");
    }

    const result = await runRetentionMaintenance(db, { apply: true, now: NOW });
    expect(result).toMatchObject({
      dryRun: false,
      softDeletedResumesPurged: 100,
      expiredGuestsPurged: 50,
    });
    expect(adapter.statementCount).toBe(RETENTION_MAINTENANCE_STATEMENT_BUDGET);
    expect(adapter.statementCount + maximumInitializationQueryCount(
      templates.length,
      targetProfiles.length,
    )).toBeLessThanOrEqual(45);
  });

  it("does not erase pending attempts beyond the bounded recovery batch", async () => {
    const adapter = createDatabase();
    const db = adapter as unknown as Database;
    insertUser(adapter.sqlite, "user-backlog", "2026-08-01T00:00:00.000Z");
    adapter.sqlite.exec(`INSERT INTO ai_credit_lots
      (id, user_id, source, reference_id, initial_credits, remaining_credits, created_at)
      VALUES ('backlog-lot', 'user-backlog', 'paid', 'backlog', 51, 0, '2026-08-01T00:00:00.000Z')`);
    const ledger = adapter.sqlite.prepare(`INSERT INTO ai_credit_ledger
      (id, request_id, user_id, lot_id, credits, status, model, created_at)
      VALUES (?, ?, 'user-backlog', 'backlog-lot', 1, 'reserved', 'deepseek-v4-flash',
        '2026-05-01T00:00:00.000Z')`);
    const cost = adapter.sqlite.prepare(`INSERT INTO model_run_costs
      (request_id, user_id, model, status, price_version, created_at)
      VALUES (?, 'user-backlog', 'deepseek-v4-flash', 'running', 'v1',
        '2026-05-01T00:00:00.000Z')`);
    const delivery = adapter.sqlite.prepare(`INSERT INTO model_advice_deliveries
      (request_id, user_id, resume_id, request_fingerprint, response_json, attempt_state,
       updated_at, created_at, expires_at)
      VALUES (?, 'user-backlog', 'resume-backlog', ?, '__pending__', 'prepared',
        '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z', '2026-05-01T00:15:00.000Z')`);
    for (let index = 0; index < 51; index += 1) {
      const requestId = `backlog-${String(index).padStart(2, "0")}`;
      ledger.run(`ledger-${index}`, requestId);
      cost.run(requestId);
      delivery.run(requestId, `fingerprint-${index}`);
    }

    const first = await runRetentionMaintenance(db, { apply: true, now: NOW });

    expect(first).toMatchObject({ recoveredPendingAttempts: 50 });
    expect(adapter.sqlite.prepare(`SELECT response_json, attempt_state FROM model_advice_deliveries
      WHERE request_id = 'backlog-50'`).get()).toEqual({
      response_json: "__pending__",
      attempt_state: "prepared",
    });
    expect(adapter.sqlite.prepare(`SELECT status FROM ai_credit_ledger
      WHERE request_id = 'backlog-50'`).get()).toEqual({ status: "reserved" });
    expect(adapter.sqlite.prepare(`SELECT status FROM model_run_costs
      WHERE request_id = 'backlog-50'`).get()).toEqual({ status: "running" });
    expect(adapter.sqlite.prepare("SELECT remaining_credits FROM ai_credit_lots WHERE id = 'backlog-lot'").get())
      .toEqual({ remaining_credits: 50 });

    const second = await runRetentionMaintenance(db, { apply: true, now: NOW });
    expect(second).toMatchObject({ recoveredPendingAttempts: 1 });
    expect(adapter.sqlite.prepare("SELECT remaining_credits FROM ai_credit_lots WHERE id = 'backlog-lot'").get())
      .toEqual({ remaining_credits: 51 });
  });

  it("recovers an expired abandoned pending delivery before later tombstone deletion", async () => {
    const adapter = createDatabase();
    const db = adapter as unknown as Database;
    insertUser(adapter.sqlite, "user-abandoned", "2026-08-31T00:00:00.000Z");
    adapter.sqlite.exec(`
      INSERT INTO ai_credit_lots
        (id, user_id, source, reference_id, initial_credits, remaining_credits, created_at)
        VALUES ('abandoned-lot', 'user-abandoned', 'signup', 'seed', 5, 5, '2026-08-31T00:00:00.000Z');
      INSERT INTO ai_credit_ledger
        (id, request_id, user_id, lot_id, credits, status, model, release_reason, created_at, settled_at)
        VALUES ('abandoned-ledger', 'abandoned-request', 'user-abandoned', 'abandoned-lot', 1,
          'released', 'deepseek-v4-flash', 'abandoned-request', '2026-08-31T00:00:00.000Z',
          '2026-08-31T00:01:00.000Z');
      INSERT INTO model_run_costs
        (request_id, user_id, model, status, price_version, credit_ledger_id, failure_kind, created_at, settled_at)
        VALUES ('abandoned-request', 'user-abandoned', 'deepseek-v4-flash', 'failed', 'v1',
          'abandoned-ledger', 'abandoned-request', '2026-08-31T00:00:00.000Z', '2026-08-31T00:01:00.000Z');
      INSERT INTO model_advice_deliveries
        (request_id, user_id, resume_id, request_fingerprint, response_json, attempt_state,
         failure_kind, updated_at, created_at, expires_at, terminal_at)
        VALUES ('abandoned-request', 'user-abandoned', 'resume-abandoned', 'fp-abandoned',
          '__pending__', 'abandoned', 'abandoned-request', '2026-08-31T00:01:00.000Z',
          '2026-08-31T00:00:00.000Z', '2026-08-31T00:15:00.000Z', '2026-08-31T00:01:00.000Z');
    `);

    const recovered = await runRetentionMaintenance(db, { apply: true, now: NOW });
    expect(recovered).toMatchObject({ pendingAttemptsDue: 1, recoveredPendingAttempts: 1 });
    expect(adapter.sqlite.prepare(`SELECT response_json, attempt_state
      FROM model_advice_deliveries WHERE request_id = 'abandoned-request'`).get()).toEqual({
      response_json: "{}",
      attempt_state: "expired",
    });

    const afterTombstoneTtl = new Date("2026-12-02T00:30:00.000Z");
    const purged = await runRetentionMaintenance(db, { apply: true, now: afterTombstoneTtl });
    expect(purged).toMatchObject({ adviceTombstonesDeleted: 1 });
    expect(adapter.sqlite.prepare(`SELECT request_id FROM model_advice_deliveries
      WHERE request_id = 'abandoned-request'`).get()).toBeUndefined();
  });
});

function seedModelLifecycle(sqlite: DatabaseSync) {
  insertUser(sqlite, "user-1", "2026-08-01T00:00:00.000Z");
  sqlite.exec(`
    INSERT INTO ai_credit_lots
      (id, user_id, source, reference_id, initial_credits, remaining_credits, created_at)
      VALUES ('lot-1', 'user-1', 'signup', 'seed', 5, 4, '2026-08-01T00:00:00.000Z');
    INSERT INTO ai_credit_ledger
      (id, request_id, user_id, lot_id, credits, status, model, created_at)
      VALUES ('ledger-1', 'pending-request', 'user-1', 'lot-1', 1, 'reserved', 'deepseek-chat', '2026-09-01T00:00:00.000Z');
    INSERT INTO model_run_costs
      (request_id, user_id, model, status, price_version, credit_ledger_id, created_at)
      VALUES
        ('pending-request', 'user-1', 'deepseek-chat', 'running', 'v1', 'ledger-1', '2026-09-01T00:00:00.000Z'),
        ('old-cost', 'anonymous', 'deepseek-chat', 'failed', 'v1', NULL, '2026-05-01T00:00:00.000Z'),
        ('ancient-cost', 'anonymous', 'deepseek-chat', 'failed', 'v1', NULL, '2024-05-01T00:00:00.000Z');
    INSERT INTO model_advice_deliveries
      (request_id, user_id, resume_id, request_fingerprint, response_json, attempt_state,
       updated_at, created_at, expires_at, terminal_at, failure_kind)
      VALUES
        ('pending-request', 'user-1', 'resume-1', 'fp-1', '__pending__', 'prepared',
         '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z', '2026-09-01T00:15:00.000Z', NULL, NULL),
        ('terminal-request', 'user-1', 'resume-1', 'fp-2', '{"score":80}', 'succeeded',
         '2026-09-01T00:01:00.000Z', '2026-09-01T00:00:00.000Z', '2026-09-01T00:15:00.000Z', '2026-09-01T00:01:00.000Z', NULL),
        ('old-tombstone', 'user-1', 'resume-1', 'fp-3', '{}', 'expired',
         '2026-05-01T00:01:00.000Z', '2026-05-01T00:00:00.000Z', '2026-05-01T00:15:00.000Z', '2026-05-01T00:01:00.000Z', 'old');
    INSERT INTO signup_promo_redemptions
      (identity_hash, granted_user_id, campaign, created_at, retained_until)
      VALUES
        ('${"a".repeat(64)}', 'user-1', 'launch', '2026-08-01T00:00:00.000Z', '2026-09-01T00:20:00.000Z'),
        ('${"b".repeat(64)}', 'user-1', 'launch', '2026-08-01T00:00:00.000Z', '2027-09-01T00:20:00.000Z');
  `);
}

function insertUser(sqlite: DatabaseSync, id: string, createdAt: string) {
  sqlite.prepare(`INSERT INTO users
    (id, name, email, email_verified, role, banned, phone_number_verified, created_at, updated_at)
    VALUES (?, ?, ?, 0, 'user', 0, 0, ?, ?)`)
    .run(id, id, `${id}@example.invalid`, createdAt, createdAt);
}

function createDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  let statementCount = 0;
  sqlite.exec("PRAGMA foreign_keys = ON");
  const migrationDirectory = resolve(process.cwd(), "drizzle");
  for (const migration of readdirSync(migrationDirectory).filter((name) => /^\d+_.+\.sql$/.test(name)).sort()) {
    sqlite.exec(readFileSync(resolve(migrationDirectory, migration), "utf8")
      .replaceAll("--> statement-breakpoint", ""));
  }
  return {
    sqlite,
    get statementCount() { return statementCount; },
    prepare: (sql: string) => new Statement(sqlite, sql, () => { statementCount += 1; }),
    async batch(statements: Statement[]) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

class Statement {
  private values: unknown[] = [];
  constructor(
    private readonly sqlite: DatabaseSync,
    private readonly sql: string,
    private readonly onExecute: () => void,
  ) {}
  bind(...values: unknown[]) {
    if (values.length > 100) throw new Error("D1 bind parameter limit exceeded");
    this.values = values;
    return this;
  }
  async first<T>() {
    this.onExecute();
    return (this.sqlite.prepare(this.sql).get(...this.values as never[]) ?? null) as T | null;
  }
  async all<T>() {
    this.onExecute();
    return { results: this.sqlite.prepare(this.sql).all(...this.values as never[]) as T[] };
  }
  async run() {
    this.onExecute();
    return this.sqlite.prepare(this.sql).run(...this.values as never[]);
  }
}
