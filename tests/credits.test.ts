import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { getDatabase } from "@/../db";
import {
  AiCreditSettlementUncertainError,
  commitAiCredit,
  ensureSignupCredits,
  getCreditBalance,
  getSignupPromoIdentityHashes,
  releaseAiCredit,
  reserveAiCredit,
  settleAiCreditForModelRun,
  settleFailedAiCreditForModelRun,
  syncSignupPromoIdentities,
} from "@/lib/credits";

type D1Database = ReturnType<typeof getDatabase>;

describe("AI credit settlement", () => {
  it("grants once, reserves atomically, releases idempotently, and commits once", async () => {
    const adapter = createTestDatabase();
    const db = adapter as unknown as D1Database;
    adapter.sqlite.prepare("INSERT INTO users (id) VALUES (?)").run("user-1");

    expect((await grantSignupCredits(db, "user-1")).total).toBe(5);
    expect((await grantSignupCredits(db, "user-1")).total).toBe(5);

    const released = await reserveAiCredit(db, "user-1", "request-release", "deepseek-v4-flash");
    expect(released).not.toBeNull();
    expect((await getCreditBalance(db, "user-1")).total).toBe(4);
    await releaseAiCredit(db, released!, "provider-error");
    await releaseAiCredit(db, released!, "duplicate-release");
    expect((await getCreditBalance(db, "user-1")).total).toBe(5);

    const consumed = await reserveAiCredit(db, "user-1", "request-consume", "deepseek-v4-flash");
    expect(consumed).not.toBeNull();
    expect(await commitAiCredit(db, consumed!)).toBe(true);
    expect(await commitAiCredit(db, consumed!)).toBe(false);
    expect((await getCreditBalance(db, "user-1")).total).toBe(4);
    expect(adapter.sqlite.prepare("SELECT status FROM ai_credit_ledger WHERE request_id = ?").get("request-consume"))
      .toEqual({ status: "consumed" });

    await expect(reserveAiCredit(db, "user-1", "request-consume", "deepseek-v4-flash")).rejects.toThrow();
    expect((await getCreditBalance(db, "user-1")).total).toBe(4);

    const stale = await reserveAiCredit(db, "user-1", "request-stale", "deepseek-v4-flash");
    adapter.sqlite.prepare("UPDATE ai_credit_ledger SET created_at = ? WHERE id = ?")
      .run("2000-01-01T00:00:00.000Z", stale!.id);
    expect((await getCreditBalance(db, "user-1", { recoverStale: true })).total).toBe(4);
    expect(adapter.sqlite.prepare("SELECT status FROM ai_credit_ledger WHERE request_id = ?").get("request-stale"))
      .toEqual({ status: "released" });
  });

  it("settles the model cost and credit together and remains idempotent", async () => {
    const adapter = createTestDatabase();
    const db = adapter as unknown as D1Database;
    adapter.sqlite.prepare("INSERT INTO users (id) VALUES (?)").run("user-settle");
    await grantSignupCredits(db, "user-settle");
    const reservation = await reserveAiCredit(
      db,
      "user-settle",
      "request-settle",
      "deepseek-v4-flash",
    );
    insertRunningModelCost(adapter.sqlite, reservation!);

    const usage = { inputTokens: 1_000, cachedInputTokens: 100, outputTokens: 200 };
    const delivery = deliveryFor(reservation!);
    expect(await settleAiCreditForModelRun(db, reservation!, "deepseek-v4-flash", usage, delivery)).toBe(true);
    expect(await settleAiCreditForModelRun(db, reservation!, "deepseek-v4-flash", usage, delivery)).toBe(true);
    expect((await getCreditBalance(db, "user-settle")).total).toBe(4);
    expect(adapter.sqlite.prepare(`SELECT l.status AS ledger_status, m.status AS run_status
      FROM ai_credit_ledger l JOIN model_run_costs m ON m.credit_ledger_id = l.id
      WHERE l.id = ?`).get(reservation!.id)).toEqual({
        ledger_status: "consumed",
        run_status: "succeeded",
      });
  });

  it("does not consume a credit when the linked model run cannot settle", async () => {
    const adapter = createTestDatabase();
    const db = adapter as unknown as D1Database;
    adapter.sqlite.prepare("INSERT INTO users (id) VALUES (?)").run("user-no-run");
    await grantSignupCredits(db, "user-no-run");
    const missing = await reserveAiCredit(db, "user-no-run", "request-missing", "deepseek-v4-flash");

    expect(await settleAiCreditForModelRun(
      db,
      missing!,
      "deepseek-v4-flash",
      { inputTokens: 100, cachedInputTokens: 0, outputTokens: 20 },
      deliveryFor(missing!),
    )).toBe(false);
    expect(adapter.sqlite.prepare("SELECT status FROM ai_credit_ledger WHERE id = ?").get(missing!.id))
      .toEqual({ status: "reserved" });
    await releaseAiCredit(db, missing!, "missing-model-run");
    expect((await getCreditBalance(db, "user-no-run")).total).toBe(5);
  });

  it("rolls back the consumed ledger if the model-cost update fails", async () => {
    const adapter = createTestDatabase();
    const db = adapter as unknown as D1Database;
    adapter.sqlite.prepare("INSERT INTO users (id) VALUES (?)").run("user-rollback");
    await grantSignupCredits(db, "user-rollback");
    const reservation = await reserveAiCredit(db, "user-rollback", "request-rollback", "deepseek-v4-flash");
    insertRunningModelCost(adapter.sqlite, reservation!);
    adapter.sqlite.exec(`CREATE TRIGGER reject_model_cost_update
      BEFORE UPDATE ON model_run_costs BEGIN SELECT RAISE(ABORT, 'injected failure'); END;`);

    await expect(settleAiCreditForModelRun(
      db,
      reservation!,
      "deepseek-v4-flash",
      { inputTokens: 100, cachedInputTokens: 0, outputTokens: 20 },
      deliveryFor(reservation!),
    )).rejects.toBeInstanceOf(AiCreditSettlementUncertainError);
    expect(adapter.sqlite.prepare("SELECT status FROM ai_credit_ledger WHERE id = ?").get(reservation!.id))
      .toEqual({ status: "reserved" });
  });

  it("recognizes a settlement that committed before the batch response was lost", async () => {
    const adapter = createTestDatabase();
    const db = adapter as unknown as D1Database;
    adapter.sqlite.prepare("INSERT INTO users (id) VALUES (?)").run("user-ambiguous");
    await grantSignupCredits(db, "user-ambiguous");
    const reservation = await reserveAiCredit(db, "user-ambiguous", "request-ambiguous", "deepseek-v4-flash");
    insertRunningModelCost(adapter.sqlite, reservation!);
    adapter.failNextBatchAfterCommit();

    expect(await settleAiCreditForModelRun(
      db,
      reservation!,
      "deepseek-v4-flash",
      { inputTokens: 100, cachedInputTokens: 0, outputTokens: 20 },
      deliveryFor(reservation!),
    )).toBe(true);
    expect(adapter.sqlite.prepare("SELECT status FROM ai_credit_ledger WHERE id = ?").get(reservation!.id))
      .toEqual({ status: "consumed" });
    expect(adapter.sqlite.prepare("SELECT request_id FROM model_advice_deliveries WHERE request_id = ?").get(reservation!.requestId))
      .toEqual({ request_id: reservation!.requestId });
  });

  it("atomically refunds a failed model run and stores its replayable fallback", async () => {
    const adapter = createTestDatabase();
    const db = adapter as unknown as D1Database;
    adapter.sqlite.prepare("INSERT INTO users (id) VALUES (?)").run("user-failed");
    await grantSignupCredits(db, "user-failed");
    const reservation = await reserveAiCredit(db, "user-failed", "request-failed", "deepseek-v4-flash");
    insertRunningModelCost(adapter.sqlite, reservation!);
    insertPendingDelivery(adapter.sqlite, reservation!);
    const delivery = deliveryFor(reservation!);

    expect(await settleFailedAiCreditForModelRun(
      db,
      reservation!,
      "deepseek-v4-flash",
      "provider-timeout",
      { inputTokens: 900, cachedInputTokens: 100, outputTokens: 12 },
      delivery,
    )).toBe(true);
    expect((await getCreditBalance(db, "user-failed")).total).toBe(5);
    expect(adapter.sqlite.prepare(`SELECT l.status AS ledger_status, l.release_reason,
        m.status AS run_status, m.failure_kind, d.response_json
      FROM ai_credit_ledger l
      JOIN model_run_costs m ON m.credit_ledger_id = l.id
      JOIN model_advice_deliveries d ON d.request_id = l.request_id
      WHERE l.id = ?`).get(reservation!.id)).toEqual({
      ledger_status: "released",
      release_reason: "provider-timeout",
      run_status: "failed",
      failure_kind: "provider-timeout",
      response_json: delivery.responseJson,
    });
  });

  it("rolls back the refund when the terminal failure delivery cannot be stored", async () => {
    const adapter = createTestDatabase();
    const db = adapter as unknown as D1Database;
    adapter.sqlite.prepare("INSERT INTO users (id) VALUES (?)").run("user-failure-rollback");
    await grantSignupCredits(db, "user-failure-rollback");
    const reservation = await reserveAiCredit(
      db,
      "user-failure-rollback",
      "request-failure-rollback",
      "deepseek-v4-flash",
    );
    insertRunningModelCost(adapter.sqlite, reservation!);
    insertPendingDelivery(adapter.sqlite, reservation!);
    adapter.sqlite.exec(`CREATE TRIGGER reject_failure_delivery
      BEFORE UPDATE ON model_advice_deliveries BEGIN SELECT RAISE(ABORT, 'injected failure'); END;`);

    await expect(settleFailedAiCreditForModelRun(
      db,
      reservation!,
      "deepseek-v4-flash",
      "provider-error",
      undefined,
      deliveryFor(reservation!),
    )).rejects.toBeInstanceOf(AiCreditSettlementUncertainError);
    expect((await getCreditBalance(db, "user-failure-rollback")).total).toBe(4);
    expect(adapter.sqlite.prepare(`SELECT l.status AS ledger_status, m.status AS run_status,
        d.response_json
      FROM ai_credit_ledger l
      JOIN model_run_costs m ON m.credit_ledger_id = l.id
      JOIN model_advice_deliveries d ON d.request_id = l.request_id
      WHERE l.id = ?`).get(reservation!.id)).toEqual({
      ledger_status: "reserved",
      run_status: "running",
      response_json: "__pending__",
    });
  });

  it("recognizes a failed settlement that committed before its batch response was lost", async () => {
    const adapter = createTestDatabase();
    const db = adapter as unknown as D1Database;
    adapter.sqlite.prepare("INSERT INTO users (id) VALUES (?)").run("user-failure-ambiguous");
    await grantSignupCredits(db, "user-failure-ambiguous");
    const reservation = await reserveAiCredit(
      db,
      "user-failure-ambiguous",
      "request-failure-ambiguous",
      "deepseek-v4-flash",
    );
    insertRunningModelCost(adapter.sqlite, reservation!);
    insertPendingDelivery(adapter.sqlite, reservation!);
    adapter.failNextBatchAfterCommit();

    expect(await settleFailedAiCreditForModelRun(
      db,
      reservation!,
      "deepseek-v4-flash",
      "provider-error",
      undefined,
      deliveryFor(reservation!),
    )).toBe(true);
    expect((await getCreditBalance(db, "user-failure-ambiguous")).total).toBe(5);
    expect(adapter.sqlite.prepare("SELECT status FROM ai_credit_ledger WHERE id = ?").get(reservation!.id))
      .toEqual({ status: "released" });
  });

  it("does not regrant the launch bonus after the same verified identity recreates an account", async () => {
    const adapter = createTestDatabase();
    const db = adapter as unknown as D1Database;
    const identityHash = identityHashFor("verified@example.com");
    adapter.sqlite.prepare("INSERT INTO users (id) VALUES (?)").run("first-account");
    expect((await ensureSignupCredits(db, "first-account", { identityHashes: [identityHash] })).total).toBe(5);
    adapter.sqlite.prepare("DELETE FROM users WHERE id = ?").run("first-account");
    adapter.sqlite.prepare(`UPDATE signup_promo_redemptions
      SET granted_user_id = 'deleted-promo-test' WHERE identity_hash = ?`).run(identityHash);
    adapter.sqlite.prepare("INSERT INTO users (id) VALUES (?)").run("second-account");

    expect((await ensureSignupCredits(db, "second-account", { identityHashes: [identityHash] })).total).toBe(0);
    expect(adapter.sqlite.prepare("SELECT COUNT(*) AS total FROM signup_promo_redemptions").get())
      .toEqual({ total: 1 });
  });

  it("derives a stable HMAC only from a verified login identity and a strong pepper", async () => {
    const adapter = createTestDatabase();
    const db = adapter as unknown as D1Database;
    adapter.sqlite.prepare(`INSERT INTO users (id, email, email_verified)
      VALUES ('verified-user', 'Student@Example.COM', 1), ('unverified-user', 'other@example.com', 0)`).run();
    const pepper = "Q3!vN7@rT2#kP8$mL4&wX9*zC6+hF5^s";
    const first = await getSignupPromoIdentityHashes(db, "verified-user", pepper);
    adapter.sqlite.prepare("UPDATE users SET email = 'student@example.com' WHERE id = 'verified-user'").run();
    const second = await getSignupPromoIdentityHashes(db, "verified-user", pepper);

    expect(first).toHaveLength(1);
    expect(first[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toEqual(first);
    expect(await getSignupPromoIdentityHashes(db, "unverified-user", pepper)).toEqual([]);
    expect(await getSignupPromoIdentityHashes(db, "verified-user", "too-short")).toEqual([]);
  });

  it("blocks a new verified phone when the verified email already redeemed", async () => {
    const adapter = createTestDatabase();
    const db = adapter as unknown as D1Database;
    const pepper = "Q3!vN7@rT2#kP8$mL4&wX9*zC6+hF5^s";
    adapter.sqlite.prepare(`INSERT INTO users
        (id, email, email_verified, phone_number, phone_number_verified)
      VALUES
        ('phone-first', 'shared@example.com', 1, '+8613800000001', 1),
        ('phone-second', 'shared@example.com', 1, '+8613800000002', 1),
        ('phone-chain', 'other@example.com', 1, '+8613800000002', 1)`).run();

    const first = await getSignupPromoIdentityHashes(db, "phone-first", pepper);
    const second = await getSignupPromoIdentityHashes(db, "phone-second", pepper);
    expect(first).toHaveLength(2);
    expect(second).toHaveLength(2);
    expect((await ensureSignupCredits(db, "phone-first", { identityHashes: first })).total).toBe(5);
    expect((await ensureSignupCredits(db, "phone-second", { identityHashes: second })).total).toBe(0);

    // The new phone joins the existing redemption cluster, closing a chained
    // A -> A+B -> B+C promotion bypass as well.
    const chained = await getSignupPromoIdentityHashes(db, "phone-chain", pepper);
    expect((await ensureSignupCredits(db, "phone-chain", { identityHashes: chained })).total).toBe(0);
    expect(adapter.sqlite.prepare("SELECT COUNT(*) AS total FROM signup_promo_redemptions").get())
      .toEqual({ total: 4 });
  });

  it("canonicalizes valid mainland phone variants before hashing", async () => {
    const adapter = createTestDatabase();
    const db = adapter as unknown as D1Database;
    const pepper = "Q3!vN7@rT2#kP8$mL4&wX9*zC6+hF5^s";
    adapter.sqlite.prepare(`INSERT INTO users
        (id, phone_number, phone_number_verified)
      VALUES
        ('phone-local', '138 0013 8000', 1),
        ('phone-country', '8613800138000', 1),
        ('phone-plus', '+86 (138) 0013-8000', 1),
        ('phone-invalid', '+1 202 555 0123', 1)`).run();

    const local = await getSignupPromoIdentityHashes(db, "phone-local", pepper);
    const country = await getSignupPromoIdentityHashes(db, "phone-country", pepper);
    const plus = await getSignupPromoIdentityHashes(db, "phone-plus", pepper);
    expect(local).toHaveLength(1);
    expect(country).toEqual(local);
    expect(plus).toEqual(local);
    expect(await getSignupPromoIdentityHashes(db, "phone-invalid", pepper)).toEqual([]);
  });

  it("blocks a changed verified email when the OAuth subject already redeemed", async () => {
    const adapter = createTestDatabase();
    const db = adapter as unknown as D1Database;
    const pepper = "Q3!vN7@rT2#kP8$mL4&wX9*zC6+hF5^s";
    adapter.sqlite.prepare(`INSERT INTO users (id, email, email_verified)
      VALUES ('oauth-first', 'old@example.com', 1), ('oauth-second', 'new@example.com', 1)`).run();
    adapter.sqlite.prepare(`INSERT INTO auth_accounts (id, provider_id, account_id, user_id)
      VALUES
        ('oauth-account-1', 'github', 'subject-123', 'oauth-first'),
        ('oauth-account-2', 'github', 'subject-123', 'oauth-second')`).run();

    const first = await getSignupPromoIdentityHashes(db, "oauth-first", pepper);
    const second = await getSignupPromoIdentityHashes(db, "oauth-second", pepper);
    expect(first).toHaveLength(2);
    expect(second).toHaveLength(2);
    expect((await ensureSignupCredits(db, "oauth-first", { identityHashes: first })).total).toBe(5);
    expect((await ensureSignupCredits(db, "oauth-second", { identityHashes: second })).total).toBe(0);
    expect(adapter.sqlite.prepare("SELECT COUNT(*) AS total FROM signup_promo_redemptions").get())
      .toEqual({ total: 3 });
  });

  it("records a newly verified phone before deletion so it cannot claim again", async () => {
    const adapter = createTestDatabase();
    const db = adapter as unknown as D1Database;
    const pepper = "Q3!vN7@rT2#kP8$mL4&wX9*zC6+hF5^s";
    adapter.sqlite.prepare(`INSERT INTO users
        (id, email, email_verified, phone_number, phone_number_verified)
      VALUES ('phone-owner', 'owner@example.com', 1, NULL, 0)`).run();

    await syncSignupPromoIdentities(db, "phone-owner", pepper);
    adapter.sqlite.prepare(`UPDATE users
      SET phone_number = '+8613800138000', phone_number_verified = 1
      WHERE id = 'phone-owner'`).run();
    await syncSignupPromoIdentities(db, "phone-owner", pepper);

    adapter.sqlite.prepare(`UPDATE signup_promo_redemptions
      SET granted_user_id = 'deleted-promo-phone-owner'
      WHERE granted_user_id = 'phone-owner'`).run();
    adapter.sqlite.prepare("DELETE FROM users WHERE id = 'phone-owner'").run();
    adapter.sqlite.prepare(`INSERT INTO users
        (id, phone_number, phone_number_verified)
      VALUES ('phone-recreated', '138 0013 8000', 1)`).run();

    const recreated = await syncSignupPromoIdentities(db, "phone-recreated", pepper);
    expect(recreated).toHaveLength(1);
    expect((await getCreditBalance(db, "phone-recreated")).total).toBe(0);
    expect(adapter.sqlite.prepare(`SELECT COUNT(*) AS total FROM ai_credit_lots
      WHERE source = 'signup'`).get()).toEqual({ total: 0 });
  });

  it("keeps OAuth and replaced-email identities in the cluster after unlink", async () => {
    const adapter = createTestDatabase();
    const db = adapter as unknown as D1Database;
    const pepper = "Q3!vN7@rT2#kP8$mL4&wX9*zC6+hF5^s";
    adapter.sqlite.prepare(`INSERT INTO users (id, email, email_verified)
      VALUES ('identity-owner', 'first@example.com', 1)`).run();
    await syncSignupPromoIdentities(db, "identity-owner", pepper);

    adapter.sqlite.prepare(`INSERT INTO auth_accounts (id, provider_id, account_id, user_id)
      VALUES ('linked-oauth', 'github', 'subject-linked', 'identity-owner')`).run();
    await syncSignupPromoIdentities(db, "identity-owner", pepper);
    adapter.sqlite.prepare("DELETE FROM auth_accounts WHERE id = 'linked-oauth'").run();
    adapter.sqlite.prepare(`UPDATE users SET email = 'second@example.com'
      WHERE id = 'identity-owner'`).run();
    await Promise.all([
      syncSignupPromoIdentities(db, "identity-owner", pepper),
      syncSignupPromoIdentities(db, "identity-owner", pepper),
    ]);

    const recorded = adapter.sqlite.prepare(`SELECT COUNT(*) AS total
      FROM signup_promo_redemptions`).get();
    expect(recorded).toEqual({ total: 3 });
    expect((await getCreditBalance(db, "identity-owner")).total).toBe(5);

    adapter.sqlite.prepare(`UPDATE signup_promo_redemptions
      SET granted_user_id = 'deleted-promo-identity-owner'
      WHERE granted_user_id = 'identity-owner'`).run();
    adapter.sqlite.prepare("DELETE FROM users WHERE id = 'identity-owner'").run();
    adapter.sqlite.prepare(`INSERT INTO users (id, email, email_verified)
      VALUES ('oauth-recreated', 'unused@example.com', 0)`).run();
    adapter.sqlite.prepare(`INSERT INTO auth_accounts (id, provider_id, account_id, user_id)
      VALUES ('oauth-recreated-account', 'github', 'subject-linked', 'oauth-recreated')`).run();

    await syncSignupPromoIdentities(db, "oauth-recreated", pepper);
    expect((await getCreditBalance(db, "oauth-recreated")).total).toBe(0);
  });
});

function identityHashFor(identity: string) {
  return createHash("sha256").update(identity).digest("hex");
}

function grantSignupCredits(db: D1Database, userId: string) {
  return ensureSignupCredits(db, userId, { identityHashes: [identityHashFor(userId)] });
}

function insertRunningModelCost(sqlite: DatabaseSync, reservation: NonNullable<Awaited<ReturnType<typeof reserveAiCredit>>>) {
  sqlite.prepare(`INSERT INTO model_run_costs
    (request_id, user_id, model, status, input_tokens, cached_input_tokens, output_tokens,
      price_version, estimated_cost_micros, credit_ledger_id, failure_kind, created_at, settled_at)
    VALUES (?, ?, 'deepseek-v4-flash', 'running', 2000, 0, 2200, 'test', 1000, ?, NULL, ?, NULL)`)
    .run(reservation.requestId, reservation.userId, reservation.id, new Date().toISOString());
}

function insertPendingDelivery(
  sqlite: DatabaseSync,
  reservation: NonNullable<Awaited<ReturnType<typeof reserveAiCredit>>>,
) {
  const delivery = deliveryFor(reservation);
  sqlite.prepare(`INSERT INTO model_advice_deliveries
      (request_id, user_id, resume_id, request_fingerprint, response_json, created_at, expires_at)
    VALUES (?, ?, ?, ?, '__pending__', ?, ?)`)
    .run(
      reservation.requestId,
      delivery.userId,
      delivery.resumeId,
      delivery.requestFingerprint,
      delivery.createdAt,
      delivery.expiresAt,
    );
}

function deliveryFor(reservation: NonNullable<Awaited<ReturnType<typeof reserveAiCredit>>>) {
  return {
    userId: reservation.userId,
    resumeId: "resume-test",
    requestFingerprint: `fingerprint-${reservation.requestId}`,
    responseJson: JSON.stringify({ score: 80 }),
    createdAt: "2026-08-31T00:00:00.000Z",
    expiresAt: "2026-08-31T00:15:00.000Z",
  };
}

function createTestDatabase() {
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
      user_id TEXT NOT NULL
    );
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
    );
    CREATE TABLE model_advice_deliveries (
      request_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      resume_id TEXT NOT NULL,
      request_fingerprint TEXT NOT NULL,
      response_json TEXT NOT NULL,
      attempt_state TEXT NOT NULL DEFAULT 'prepared',
      provider_key TEXT,
      credit_ledger_id TEXT,
      provider_response_id TEXT,
      started_at TEXT,
      updated_at TEXT NOT NULL DEFAULT '',
      terminal_at TEXT,
      failure_kind TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
  `);

  const prepare = (sql: string) => new TestStatement(sqlite, sql);
  let failBatchAfterCommit = false;
  return {
    sqlite,
    prepare,
    failNextBatchAfterCommit() {
      failBatchAfterCommit = true;
    },
    async batch(statements: TestStatement[]) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec("COMMIT");
        if (failBatchAfterCommit) {
          failBatchAfterCommit = false;
          throw new Error("batch response lost after commit");
        }
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

class TestStatement {
  private values: unknown[] = [];

  constructor(private readonly sqlite: DatabaseSync, private readonly sql: string) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async run() {
    return this.sqlite.prepare(this.sql).run(...this.values as never[]);
  }

  async first<T>() {
    return (this.sqlite.prepare(this.sql).get(...this.values as never[]) ?? null) as T | null;
  }

  async all<T>() {
    return { results: this.sqlite.prepare(this.sql).all(...this.values as never[]) as T[] };
  }
}
