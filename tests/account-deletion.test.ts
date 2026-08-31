import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { getDatabase } from "@/../db";
import { deleteApplicationData } from "@/lib/account-deletion";
import { getCreditBalance, syncSignupPromoIdentities } from "@/lib/credits";

type Database = ReturnType<typeof getDatabase>;

describe("atomic account deletion", () => {
  it("rolls back application cleanup when the core-user transaction fails", async () => {
    const adapter = createDatabase(8);
    seed(adapter.sqlite);

    await expect(deleteApplicationData(adapter as unknown as Database, "user-1"))
      .rejects.toThrow("injected batch failure");

    expect(adapter.sqlite.prepare("SELECT id FROM users WHERE id = 'user-1'").get()).toEqual({ id: "user-1" });
    expect(adapter.sqlite.prepare("SELECT id FROM resumes WHERE user_id = 'user-1'").get()).toEqual({ id: "resume-1" });
    expect(adapter.sqlite.prepare("SELECT id FROM ai_credit_lots WHERE user_id = 'user-1'").get()).toEqual({ id: "lot-1" });
    expect(adapter.sqlite.prepare("SELECT user_id FROM model_run_costs WHERE request_id = 'request-1'").get())
      .toEqual({ user_id: "user-1" });
    expect(adapter.sqlite.prepare("SELECT * FROM model_session_leases").all()).toEqual([]);
  });

  it("removes the identity and application data in one committed batch", async () => {
    const adapter = createDatabase();
    seed(adapter.sqlite);

    await deleteApplicationData(adapter as unknown as Database, "user-1");

    expect(adapter.sqlite.prepare("SELECT id FROM users WHERE id = 'user-1'").get()).toBeUndefined();
    expect(adapter.sqlite.prepare("SELECT id FROM resumes WHERE user_id = 'user-1'").get()).toBeUndefined();
    expect(adapter.sqlite.prepare("SELECT id FROM ai_credit_lots WHERE user_id = 'user-1'").get()).toBeUndefined();
    expect(adapter.sqlite.prepare("SELECT user_id, credit_ledger_id FROM model_run_costs WHERE request_id = 'request-1'").get())
      .toMatchObject({ credit_ledger_id: null });
    const runOwners = adapter.sqlite.prepare("SELECT user_id FROM model_run_costs ORDER BY request_id").all() as Array<{ user_id: string }>;
    const orderOwner = adapter.sqlite.prepare("SELECT user_id FROM credit_orders WHERE id = 'order-paid'").get() as { user_id: string };
    expect(runOwners.every((row) => row.user_id.startsWith("deleted-run-"))).toBe(true);
    expect(new Set(runOwners.map((row) => row.user_id)).size).toBe(runOwners.length);
    expect(orderOwner.user_id.startsWith("deleted-order-")).toBe(true);
    expect(runOwners.map((row) => row.user_id)).not.toContain(orderOwner.user_id);
    const promoOwner = adapter.sqlite.prepare(`SELECT granted_user_id
      FROM signup_promo_redemptions`).get() as { granted_user_id: string };
    expect(promoOwner.granted_user_id.startsWith("deleted-promo-")).toBe(true);
    expect(adapter.sqlite.prepare("SELECT * FROM model_session_leases").all()).toEqual([]);
  });

  it("atomically records every verified identity before deleting the account", async () => {
    const adapter = createDatabase();
    const db = adapter as unknown as Database;
    const pepper = "Q3!vN7@rT2#kP8$mL4&wX9*zC6+hF5^s";
    adapter.sqlite.prepare(`INSERT INTO users
        (id, email, email_verified, phone_number, phone_number_verified)
      VALUES ('promo-owner', 'owner@example.com', 1, '+8613800138000', 1)`).run();
    adapter.sqlite.prepare(`INSERT INTO auth_accounts
        (id, provider_id, account_id, user_id)
      VALUES ('oauth-owner', 'github', 'subject-owner', 'promo-owner')`).run();

    await deleteApplicationData(db, "promo-owner", pepper);

    const redemptions = adapter.sqlite.prepare(`SELECT identity_hash, granted_user_id
      FROM signup_promo_redemptions ORDER BY identity_hash`).all() as Array<{
        identity_hash: string;
        granted_user_id: string;
      }>;
    expect(redemptions).toHaveLength(3);
    expect(redemptions.every((row) => /^[a-f0-9]{64}$/.test(row.identity_hash))).toBe(true);
    expect(redemptions.every((row) => row.granted_user_id.startsWith("deleted-promo-"))).toBe(true);

    adapter.sqlite.prepare(`INSERT INTO users
        (id, phone_number, phone_number_verified)
      VALUES ('promo-recreated', '138 0013 8000', 1)`).run();
    await syncSignupPromoIdentities(db, "promo-recreated", pepper);
    expect((await getCreditBalance(db, "promo-recreated")).total).toBe(0);
  });
});

function seed(sqlite: DatabaseSync) {
  sqlite.prepare("INSERT INTO users (id) VALUES ('user-1')").run();
  sqlite.prepare("INSERT INTO resumes VALUES ('resume-1', 'user-1')").run();
  sqlite.prepare("INSERT INTO suggestion_events VALUES ('suggestion-1', 'resume-1')").run();
  sqlite.prepare("INSERT INTO resume_versions VALUES ('version-1', 'resume-1')").run();
  sqlite.prepare(`INSERT INTO ai_credit_lots
    (id, user_id, source, reference_id, initial_credits, remaining_credits, created_at)
    VALUES ('lot-1', 'user-1', 'signup', 'launch-signup-v1', 5, 5, '2026-09-01T00:00:00.000Z')`).run();
  sqlite.prepare("INSERT INTO ai_credit_ledger VALUES ('ledger-1', 'user-1')").run();
  sqlite.prepare("INSERT INTO model_run_costs VALUES ('request-1', 'user-1', 'ledger-1')").run();
  sqlite.prepare("INSERT INTO model_run_costs VALUES ('request-2', 'user-1', NULL)").run();
  sqlite.prepare("INSERT INTO credit_orders VALUES ('order-paid', 'user-1', 'paid')").run();
  sqlite.prepare(`INSERT INTO signup_promo_redemptions
    VALUES (?, 'user-1', 'launch-signup-v1', '2026-09-01T00:00:00.000Z', '2028-09-01T00:00:00.000Z')`)
    .run("b".repeat(64));
}

function createDatabase(failBatchAt?: number) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL DEFAULT '',
      email_verified INTEGER NOT NULL DEFAULT 0,
      phone_number TEXT,
      phone_number_verified INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE auth_accounts (
      id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE model_session_leases (owner_key TEXT PRIMARY KEY, request_id TEXT, expires_at TEXT);
    CREATE TABLE resumes (id TEXT PRIMARY KEY, user_id TEXT);
    CREATE TABLE suggestion_events (id TEXT PRIMARY KEY, resume_id TEXT);
    CREATE TABLE resume_versions (id TEXT PRIMARY KEY, resume_id TEXT);
    CREATE TABLE resume_target_briefs (id TEXT PRIMARY KEY, user_id TEXT, resume_id TEXT);
    CREATE TABLE model_consent_events (id TEXT PRIMARY KEY, user_id TEXT);
    CREATE TABLE legal_acceptances (id TEXT PRIMARY KEY, user_id TEXT);
    CREATE TABLE model_advice_deliveries (id TEXT PRIMARY KEY, user_id TEXT);
    CREATE TABLE ai_credit_ledger (id TEXT PRIMARY KEY, user_id TEXT);
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
    CREATE TABLE signup_promo_redemptions (
      identity_hash TEXT PRIMARY KEY,
      granted_user_id TEXT NOT NULL,
      campaign TEXT NOT NULL,
      created_at TEXT NOT NULL,
      retained_until TEXT NOT NULL
    );
    CREATE TABLE model_run_costs (request_id TEXT PRIMARY KEY, user_id TEXT, credit_ledger_id TEXT);
    CREATE TABLE credit_orders (id TEXT PRIMARY KEY, user_id TEXT, status TEXT);
    CREATE TABLE advice_usage_events (id TEXT PRIMARY KEY, user_id TEXT);
    CREATE TABLE model_usage_events (id TEXT PRIMARY KEY, user_id TEXT);
    CREATE TABLE audit_events (id TEXT PRIMARY KEY, actor_id TEXT);
    CREATE TABLE guest_sessions (id TEXT PRIMARY KEY, user_id TEXT);
  `);
  return {
    sqlite,
    prepare(sql: string) {
      return new Statement(sqlite, sql);
    },
    async batch(statements: Statement[]) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const [index, statement] of statements.entries()) {
          if (index === failBatchAt) throw new Error("injected batch failure");
          results.push(await statement.run());
        }
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

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async first<T>() {
    return (this.sqlite.prepare(this.sql).get(...this.values as never[]) ?? null) as T | null;
  }

  async all<T>() {
    return { results: this.sqlite.prepare(this.sql).all(...this.values as never[]) as T[] };
  }

  async run() {
    return this.sqlite.prepare(this.sql).run(...this.values as never[]);
  }
}
