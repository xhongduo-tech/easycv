import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { getDatabase } from "@/../db";
import { inspectModelReconciliation } from "@/lib/model-reconciliation";

type Database = ReturnType<typeof getDatabase>;

describe("model reconciliation", () => {
  it("ignores records removed by retention or account deletion and caps recovery work", async () => {
    const adapter = createDatabase();
    adapter.sqlite.exec(`
      INSERT INTO ai_credit_lots VALUES ('lot-1', 10, 6, 'paid');
      INSERT INTO ai_credit_ledger VALUES
        ('old-missing-cost', 'lot-1', 1, 'consumed', '2026-05-01T00:00:00.000Z'),
        ('recent-missing-cost', 'lot-1', 1, 'consumed', '2026-08-31T00:00:00.000Z'),
        ('normal-cost', 'lot-1', 1, 'released', '2026-08-31T00:00:00.000Z');
      INSERT INTO model_run_costs VALUES
        ('normal-cost', 'user-1', 'succeeded', '2026-08-31T00:00:00.000Z'),
        ('deleted-cost', 'deleted-run-abc', 'failed', '2026-08-31T00:00:00.000Z'),
        ('guest-cost', 'expired-guest-abc', 'failed', '2026-08-31T00:00:00.000Z'),
        ('missing-delivery', 'user-1', 'failed', '2026-08-31T00:00:00.000Z'),
        ('old-missing-delivery', 'user-1', 'failed', '2026-05-01T00:00:00.000Z');
    `);
    adapter.sqlite.prepare(`INSERT INTO model_advice_deliveries
      (request_id, user_id, attempt_state, updated_at)
      VALUES ('normal-cost', 'user-1', 'succeeded', '2026-08-31T00:00:00.000Z')`).run();
    const staleInsert = adapter.sqlite.prepare(`INSERT INTO model_advice_deliveries
      (request_id, user_id, attempt_state, updated_at) VALUES (?, 'user-1', 'prepared', '2026-08-31T00:00:00.000Z')`);
    for (let index = 0; index < 10; index += 1) staleInsert.run(`stale-${index}`);

    const result = await inspectModelReconciliation(
      adapter as unknown as Database,
      new Date("2026-09-01T00:00:00.000Z"),
    );

    expect(result.staleAttempts).toHaveLength(4);
    // One recent consumed ledger lacks a cost; one released ledger has a
    // succeeded cost. The old missing cost is beyond the 90-day window.
    expect(result.ledgerRunMismatches).toBe(2);
    expect(result.missingDeliveries).toBe(1);
  });
});

function createDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE model_advice_deliveries (
      request_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      attempt_state TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE model_session_leases (owner_key TEXT PRIMARY KEY, expires_at TEXT NOT NULL);
    CREATE TABLE ai_credit_ledger (
      request_id TEXT PRIMARY KEY,
      lot_id TEXT NOT NULL,
      credits INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE model_run_costs (
      request_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE ai_credit_lots (
      id TEXT PRIMARY KEY,
      initial_credits INTEGER NOT NULL,
      remaining_credits INTEGER NOT NULL,
      source TEXT NOT NULL
    );
  `);
  return {
    sqlite,
    prepare: (sql: string) => new Statement(sqlite, sql),
  };
}

class Statement {
  private values: unknown[] = [];
  constructor(private readonly sqlite: DatabaseSync, private readonly sql: string) {}
  bind(...values: unknown[]) { this.values = values; return this; }
  async first<T>() {
    return (this.sqlite.prepare(this.sql).get(...this.values as never[]) ?? null) as T | null;
  }
  async all<T>() {
    return { results: this.sqlite.prepare(this.sql).all(...this.values as never[]) as T[] };
  }
}
