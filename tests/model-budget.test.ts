import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { getDatabase } from "@/../db";
import { reserveModelRunBudget } from "@/lib/model-budget";
import { estimateDeepSeekCostMicros } from "@/lib/pricing";

type Database = ReturnType<typeof getDatabase>;

const usage = { inputTokens: 28_000, cachedInputTokens: 0, outputTokens: 2_200 };
const cost = estimateDeepSeekCostMicros("deepseek-v4-flash", usage);

describe("atomic model spend reservation", () => {
  it("rejects even the first call when its conservative cost exceeds the budget", async () => {
    const adapter = createDatabase();
    const reserved = await reserve(adapter, "request-1", cost - 1);
    expect(reserved).toBe(false);
    expect(adapter.sqlite.prepare("SELECT COUNT(*) AS total FROM model_run_costs").get())
      .toEqual({ total: 0 });
  });

  it("includes the new call in the limit and never admits a second over-budget run", async () => {
    const adapter = createDatabase();
    expect(await reserve(adapter, "request-1", cost)).toBe(true);
    expect(await reserve(adapter, "request-2", cost)).toBe(false);
    expect(adapter.sqlite.prepare("SELECT request_id FROM model_run_costs").all())
      .toEqual([{ request_id: "request-1" }]);
  });

  it("serializes simultaneous reservations so only one crosses an exact one-call budget", async () => {
    const adapter = createDatabase();
    const results = await Promise.all([
      reserve(adapter, "request-a", cost),
      reserve(adapter, "request-b", cost),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(adapter.sqlite.prepare("SELECT COUNT(*) AS total FROM model_run_costs").get())
      .toEqual({ total: 1 });
  });

  it("rejects a released credit or a lost owner lease before any provider run", async () => {
    const released = createDatabase();
    expect(await reserve(released, "request-released", cost, { ledgerStatus: "released" })).toBe(false);
    const staleLease = createDatabase();
    expect(await reserve(staleLease, "request-stale", cost, {
      leaseExpiresAt: "2026-08-31T23:59:59.000Z",
    })).toBe(false);
  });
});

function reserve(
  adapter: ReturnType<typeof createDatabase>,
  requestId: string,
  budget: number,
  options: { ledgerStatus?: string; leaseExpiresAt?: string } = {},
) {
  const ledgerId = `ledger-${requestId}`;
  const leaseId = `lease-${requestId}`;
  adapter.sqlite.prepare(`INSERT INTO ai_credit_ledger (id, request_id, user_id, status)
    VALUES (?, ?, 'user-1', ?)`)
    .run(ledgerId, requestId, options.ledgerStatus ?? "reserved");
  adapter.sqlite.prepare(`INSERT INTO model_advice_deliveries (request_id, user_id, attempt_state)
    VALUES (?, 'user-1', 'prepared')`).run(requestId);
  adapter.sqlite.prepare(`INSERT INTO model_session_leases (owner_key, request_id, expires_at)
    VALUES ('user-1', ?, ?)
    ON CONFLICT(owner_key) DO UPDATE SET request_id = excluded.request_id, expires_at = excluded.expires_at`)
    .run(leaseId, options.leaseExpiresAt ?? "2026-09-01T00:01:00.000Z");
  return reserveModelRunBudget(adapter as unknown as Database, {
    requestId,
    userId: "user-1",
    model: "deepseek-v4-flash",
    creditLedgerId: ledgerId,
    ownerLeaseId: leaseId,
    reservedUsage: usage,
    createdAt: "2026-09-01T00:00:00.000Z",
    dayStart: "2026-09-01T00:00:00.000Z",
    dailyBudgetMicros: budget,
  });
}

function createDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE ai_credit_ledger (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL
  );
  CREATE TABLE model_advice_deliveries (
    request_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    attempt_state TEXT NOT NULL
  );
  CREATE TABLE model_session_leases (
    owner_key TEXT PRIMARY KEY,
    request_id TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE model_run_costs (
    request_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    model TEXT NOT NULL,
    status TEXT NOT NULL,
    input_tokens INTEGER,
    cached_input_tokens INTEGER,
    output_tokens INTEGER,
    price_version TEXT NOT NULL,
    estimated_cost_micros INTEGER,
    credit_ledger_id TEXT,
    failure_kind TEXT,
    created_at TEXT NOT NULL,
    settled_at TEXT
  )`);
  return {
    sqlite,
    prepare(sql: string) {
      return new Statement(sqlite, sql);
    },
  };
}

class Statement {
  private values: unknown[] = [];

  constructor(private readonly sqlite: DatabaseSync, private readonly sql: string) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async first<T>() {
    return (this.sqlite.prepare(this.sql).get(...this.values as never[]) ?? null) as T | null;
  }
}
