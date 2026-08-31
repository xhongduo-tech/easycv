import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { getDatabase } from "@/../db";
import { claimGuestApplicationData, GuestClaimBusyError } from "@/lib/guest-claim";

type D1Database = ReturnType<typeof getDatabase>;

describe("guest-to-account credit claim", () => {
  it("always grants five account credits and keeps consumed guest accounting linked", async () => {
    const adapter = createDatabase();
    seedUsers(adapter.sqlite);
    seedGuestLot(adapter.sqlite, 0);
    adapter.sqlite.prepare(`INSERT INTO ai_credit_ledger
      VALUES ('ledger-used', 'request-used', 'guest-1', 'guest-lot', 1, 'consumed', 'deepseek-v4-flash', NULL, ?, ?)`)
      .run(NOW, NOW);
    adapter.sqlite.prepare(`INSERT INTO model_run_costs
      (request_id, user_id, credit_ledger_id) VALUES ('request-used', 'guest-1', 'ledger-used')`).run();
    adapter.sqlite.prepare(`INSERT INTO ai_credit_lots
      VALUES ('signup-user-1', 'user-1', 'signup', 'launch-signup-v1', 5, 5, NULL, ?)`).run(NOW);

    await claimGuestApplicationData(adapter as unknown as D1Database, "user-1", "guest-1", NOW, [IDENTITY_HASH]);

    expect(adapter.sqlite.prepare(`SELECT remaining_credits FROM ai_credit_lots
      WHERE user_id = 'user-1' AND source = 'signup'`).get()).toEqual({ remaining_credits: 5 });
    expect(adapter.sqlite.prepare("SELECT user_id, status FROM ai_credit_ledger WHERE id = 'ledger-used'").get())
      .toEqual({ user_id: "user-1", status: "consumed" });
    expect(adapter.sqlite.prepare("SELECT user_id, credit_ledger_id FROM model_run_costs WHERE request_id = 'request-used'").get())
      .toEqual({ user_id: "user-1", credit_ledger_id: "ledger-used" });
    expect(adapter.sqlite.prepare("SELECT remaining_credits FROM ai_credit_lots WHERE id = 'guest-lot'").get())
      .toEqual({ remaining_credits: 0 });
    expect(adapter.sqlite.prepare("SELECT id FROM users WHERE id = 'guest-1'").get()).toBeUndefined();
  });

  it("releases an unfinished guest reservation and does not transfer its balance", async () => {
    const adapter = createDatabase();
    seedUsers(adapter.sqlite);
    seedGuestLot(adapter.sqlite, 0);
    adapter.sqlite.prepare(`INSERT INTO ai_credit_ledger
      VALUES ('ledger-running', 'request-running', 'guest-1', 'guest-lot', 1, 'reserved', 'deepseek-v4-flash', NULL, ?, NULL)`)
      .run(NOW);

    await claimGuestApplicationData(adapter as unknown as D1Database, "user-1", "guest-1", NOW, [IDENTITY_HASH]);

    expect(adapter.sqlite.prepare(`SELECT remaining_credits FROM ai_credit_lots
      WHERE user_id = 'user-1' AND source = 'signup'`).get()).toEqual({ remaining_credits: 5 });
    expect(adapter.sqlite.prepare(`SELECT user_id, status, release_reason FROM ai_credit_ledger
      WHERE id = 'ledger-running'`).get()).toEqual({
        user_id: "user-1",
        status: "released",
        release_reason: "guest-claimed",
      });
    expect(adapter.sqlite.prepare("SELECT source, remaining_credits FROM ai_credit_lots WHERE id = 'guest-lot'").get())
      .toEqual({ source: "guest-trial-history", remaining_credits: 0 });
  });

  it("drops an unused guest trial instead of turning it into a sixth account credit", async () => {
    const adapter = createDatabase();
    seedUsers(adapter.sqlite);
    seedGuestLot(adapter.sqlite, 1);

    await claimGuestApplicationData(adapter as unknown as D1Database, "user-1", "guest-1", NOW, [IDENTITY_HASH]);

    const balance = adapter.sqlite.prepare(`SELECT SUM(remaining_credits) AS total
      FROM ai_credit_lots WHERE user_id = 'user-1'`).get() as { total: number };
    expect(balance.total).toBe(5);
  });

  it("does not move or delete guest data while an owner request lease is active", async () => {
    const adapter = createDatabase();
    seedUsers(adapter.sqlite);
    seedGuestLot(adapter.sqlite, 1);
    adapter.sqlite.prepare(`INSERT INTO model_session_leases
      VALUES ('guest-1', 'request-running', '2026-09-01T00:01:00.000Z')`).run();

    await expect(claimGuestApplicationData(
      adapter as unknown as D1Database,
      "user-1",
      "guest-1",
      NOW,
    )).rejects.toBeInstanceOf(GuestClaimBusyError);

    expect(adapter.sqlite.prepare("SELECT id FROM users WHERE id = 'guest-1'").get()).toEqual({ id: "guest-1" });
    expect(adapter.sqlite.prepare("SELECT user_id FROM ai_credit_lots WHERE id = 'guest-lot'").get())
      .toEqual({ user_id: "guest-1" });
    expect(adapter.sqlite.prepare("SELECT request_id FROM model_session_leases WHERE owner_key = 'guest-1'").get())
      .toEqual({ request_id: "request-running" });
  });
});

const NOW = "2026-08-31T00:00:00.000Z";
const IDENTITY_HASH = "a".repeat(64);

function seedUsers(sqlite: DatabaseSync) {
  sqlite.prepare("INSERT INTO users (id) VALUES (?), (?)").run("user-1", "guest-1");
  sqlite.prepare("INSERT INTO guest_sessions (token_hash, user_id) VALUES ('token', 'guest-1')").run();
}

function seedGuestLot(sqlite: DatabaseSync, remaining: number) {
  sqlite.prepare(`INSERT INTO ai_credit_lots
    VALUES ('guest-lot', 'guest-1', 'guest-trial', 'launch-guest-v1', 1, ?, ?, ?)`).run(
      remaining,
      "2026-09-30T00:00:00.000Z",
      NOW,
    );
}

function createDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE guest_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id));
    CREATE TABLE model_session_leases (
      owner_key TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE TABLE resumes (id TEXT PRIMARY KEY, user_id TEXT, deleted_at TEXT);
    CREATE TABLE resume_target_briefs (id TEXT PRIMARY KEY, user_id TEXT);
    CREATE TABLE advice_usage_events (id TEXT PRIMARY KEY, user_id TEXT);
    CREATE TABLE model_usage_events (id TEXT PRIMARY KEY, user_id TEXT);
    CREATE TABLE model_run_costs (request_id TEXT PRIMARY KEY, user_id TEXT, credit_ledger_id TEXT);
    CREATE TABLE model_advice_deliveries (request_id TEXT PRIMARY KEY, user_id TEXT);
    CREATE TABLE model_consent_events (id TEXT PRIMARY KEY, user_id TEXT);
    CREATE TABLE audit_events (id TEXT PRIMARY KEY, actor_id TEXT);
    CREATE TABLE ai_credit_lots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source TEXT NOT NULL,
      reference_id TEXT NOT NULL,
      initial_credits INTEGER NOT NULL,
      remaining_credits INTEGER NOT NULL,
      expires_at TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, source, reference_id)
    );
    CREATE TABLE ai_credit_ledger (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lot_id TEXT NOT NULL REFERENCES ai_credit_lots(id) ON DELETE CASCADE,
      credits INTEGER NOT NULL,
      status TEXT NOT NULL,
      model TEXT NOT NULL,
      release_reason TEXT,
      created_at TEXT NOT NULL,
      settled_at TEXT
    );
    CREATE TABLE signup_promo_redemptions (
      identity_hash TEXT PRIMARY KEY,
      granted_user_id TEXT NOT NULL,
      campaign TEXT NOT NULL,
      created_at TEXT NOT NULL,
      retained_until TEXT NOT NULL
    );
  `);
  return {
    sqlite,
    prepare: (sql: string) => new Statement(sqlite, sql),
    async batch(statements: Statement[]) {
      sqlite.exec("BEGIN");
      try {
        for (const statement of statements) await statement.run();
        sqlite.exec("COMMIT");
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
