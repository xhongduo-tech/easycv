import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { getDatabase } from "@/../db";
import {
  ModelAttemptInconsistentError,
  recoverAbandonedModelAttempt,
  recoverExpiredPendingDeliveries,
} from "@/lib/model-attempt-recovery";

type Database = ReturnType<typeof getDatabase>;

describe("abandoned model-attempt recovery", () => {
  it("refunds every expired pending reservation exactly once before erasing its response", async () => {
    const adapter = createDatabase();
    const db = adapter as unknown as Database;
    seedPending(adapter.sqlite, "request-expired", "2026-09-01T00:00:00.000Z");

    await recoverExpiredPendingDeliveries(db, "2026-09-01T00:01:00.000Z");
    await recoverExpiredPendingDeliveries(db, "2026-09-01T00:02:00.000Z");

    expect(adapter.sqlite.prepare("SELECT remaining_credits FROM ai_credit_lots WHERE id = 'lot-1'").get())
      .toEqual({ remaining_credits: 5 });
    expect(adapter.sqlite.prepare(`SELECT status, release_reason FROM ai_credit_ledger
      WHERE request_id = 'request-expired'`).get()).toEqual({
      status: "released",
      release_reason: "pending-expired",
    });
    expect(adapter.sqlite.prepare(`SELECT status, failure_kind FROM model_run_costs
      WHERE request_id = 'request-expired'`).get()).toEqual({
      status: "failed",
      failure_kind: "pending-expired",
    });
    expect(adapter.sqlite.prepare(`SELECT response_json, attempt_state FROM model_advice_deliveries
      WHERE request_id = 'request-expired'`).get()).toEqual({
      response_json: "{}",
      attempt_state: "expired",
    });
  });

  it("quarantines an inconsistent attempt without blocking healthy recovery behind it", async () => {
    const adapter = createDatabase();
    const db = adapter as unknown as Database;
    seedPending(adapter.sqlite, "request-inconsistent", "2026-09-01T00:00:00.000Z");
    adapter.sqlite.prepare("UPDATE ai_credit_ledger SET status = 'consumed' WHERE request_id = ?")
      .run("request-inconsistent");
    adapter.sqlite.prepare("UPDATE model_run_costs SET status = 'succeeded' WHERE request_id = ?")
      .run("request-inconsistent");
    seedPending(adapter.sqlite, "request-healthy", "2026-09-01T00:00:01.000Z");

    expect(await recoverExpiredPendingDeliveries(
      db,
      "2026-09-01T00:01:00.000Z",
    )).toBe(1);
    expect(adapter.sqlite.prepare(`SELECT response_json FROM model_advice_deliveries
      WHERE request_id = 'request-inconsistent'`).get()).toEqual({ response_json: "__pending__" });
    expect(adapter.sqlite.prepare(`SELECT response_json FROM model_advice_deliveries
      WHERE request_id = 'request-healthy'`).get()).toEqual({ response_json: "{}" });
  });

  it("leaves every table unchanged when a settled attempt lacks its delivery", async () => {
    const adapter = createDatabase();
    const db = adapter as unknown as Database;
    seedPending(adapter.sqlite, "request-settled", "2026-09-01T00:00:00.000Z");
    adapter.sqlite.prepare("UPDATE ai_credit_ledger SET status = 'consumed' WHERE request_id = ?")
      .run("request-settled");
    adapter.sqlite.prepare("UPDATE model_run_costs SET status = 'succeeded' WHERE request_id = ?")
      .run("request-settled");
    const before = snapshotAttempt(adapter.sqlite, "request-settled");

    await expect(recoverAbandonedModelAttempt(db, "request-settled", "user-1"))
      .rejects.toBeInstanceOf(ModelAttemptInconsistentError);

    expect(snapshotAttempt(adapter.sqlite, "request-settled")).toEqual(before);
  });
});

function snapshotAttempt(sqlite: DatabaseSync, requestId: string) {
  return {
    lot: sqlite.prepare("SELECT * FROM ai_credit_lots WHERE id = 'lot-1'").get(),
    ledger: sqlite.prepare("SELECT * FROM ai_credit_ledger WHERE request_id = ?").get(requestId),
    cost: sqlite.prepare("SELECT * FROM model_run_costs WHERE request_id = ?").get(requestId),
    delivery: sqlite.prepare("SELECT * FROM model_advice_deliveries WHERE request_id = ?").get(requestId),
  };
}

function seedPending(sqlite: DatabaseSync, requestId: string, expiresAt: string) {
  sqlite.prepare("INSERT OR IGNORE INTO ai_credit_lots VALUES ('lot-1', 5)").run();
  sqlite.prepare("UPDATE ai_credit_lots SET remaining_credits = remaining_credits - 1 WHERE id = 'lot-1'").run();
  sqlite.prepare(`INSERT INTO ai_credit_ledger
    VALUES (?, 'user-1', 'lot-1', 1, 'reserved', NULL, NULL)`).run(requestId);
  sqlite.prepare(`INSERT INTO model_run_costs
    VALUES (?, 'user-1', 'running', NULL, NULL)`).run(requestId);
  sqlite.prepare(`INSERT INTO model_advice_deliveries
    (request_id, user_id, response_json, attempt_state, updated_at, expires_at)
    VALUES (?, 'user-1', '__pending__', 'prepared', ?, ?)`).run(requestId, expiresAt, expiresAt);
}

function createDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE ai_credit_lots (id TEXT PRIMARY KEY, remaining_credits INTEGER NOT NULL);
    CREATE TABLE ai_credit_ledger (
      request_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      lot_id TEXT NOT NULL,
      credits INTEGER NOT NULL,
      status TEXT NOT NULL,
      release_reason TEXT,
      settled_at TEXT
    );
    CREATE TRIGGER trg_ai_credit_ledger_settlement_refund
    AFTER UPDATE OF status, credits ON ai_credit_ledger
    WHEN OLD.status = 'reserved' AND NEW.status IN ('consumed','released')
    BEGIN
      UPDATE ai_credit_lots
      SET remaining_credits = remaining_credits + CASE
        WHEN NEW.status = 'released' THEN OLD.credits
        ELSE OLD.credits - NEW.credits
      END
      WHERE id = OLD.lot_id;
    END;
    CREATE TABLE model_run_costs (
      request_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL,
      failure_kind TEXT,
      settled_at TEXT
    );
    CREATE TABLE model_advice_deliveries (
      request_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      response_json TEXT NOT NULL,
      attempt_state TEXT NOT NULL DEFAULT 'prepared',
      failure_kind TEXT,
      updated_at TEXT NOT NULL DEFAULT '',
      terminal_at TEXT,
      expires_at TEXT NOT NULL
    );
  `);
  return {
    sqlite,
    prepare: (sql: string) => new Statement(sqlite, sql),
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
  constructor(private readonly sqlite: DatabaseSync, private readonly sql: string) {}
  bind(...values: unknown[]) { this.values = values; return this; }
  async first<T>() {
    return (this.sqlite.prepare(this.sql).get(...this.values as never[]) ?? null) as T | null;
  }
  async run() { return this.sqlite.prepare(this.sql).run(...this.values as never[]); }
}
