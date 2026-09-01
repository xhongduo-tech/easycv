import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { makeSignature } from "better-auth/crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBlankContent, targetProfiles } from "@/lib/sample-data";

const workerRuntime = vi.hoisted(() => ({
  env: {} as Record<string, unknown>,
}));

vi.mock("cloudflare:workers", () => ({
  env: workerRuntime.env,
  waitUntil: () => undefined,
}));

const AUTH_SECRET = "statement-budget-test-secret-with-32-characters";
const PROMO_PEPPER = "statement-budget-promo-pepper-with-32-characters";
const REQUEST_ID = "10000000-0000-4000-8000-000000000001";
const RESUME_ID = "20000000-0000-4000-8000-000000000002";
const USER_ID = "budget-user";
const SESSION_TOKEN = "budget-session-token";

describe("recommendation D1 statement budget", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps a cold authenticated successful model request below D1 Free's limit", async () => {
    const database = new CountingD1Database();
    migrate(database.sqlite);
    seedSuccessfulRequest(database.sqlite);
    configureRuntime(database);
    vi.stubGlobal("fetch", vi.fn(async () => successfulModelResponse()));

    // Import after binding the instrumented D1 database so Better Auth and the
    // request-time cold-start initializer use the same counted adapter.
    const { POST } = await import("@/../app/api/recommendations/route");
    const response = await POST(await recommendationRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      provider: "deepseek:deepseek-v4-flash",
      modelFallback: false,
      creditCharged: 1,
      creditBalance: 24,
      modelAvailable: true,
    });
    expect(database.statements.some((sql) => /FROM\s+[`"]?auth_sessions/i.test(sql))).toBe(true);
    expect(database.statements.some((sql) => /FROM\s+legal_acceptances/i.test(sql))).toBe(true);
    expect(database.statements).toHaveLength(41);
    expect(database.statements.length).toBeLessThanOrEqual(45);
  });

  it.each([
    ["rolls back after the last write", ["rollback"] as const, 48],
    ["commits but loses the batch acknowledgement", ["ack-uncertain"] as const, 45],
    ["rolls back once, then commits without an acknowledgement", ["rollback", "ack-uncertain"] as const, 49],
  ])("keeps a cold slot-four successful settlement within 50 statements when it %s", async (
    _scenario,
    faults,
    expectedStatements,
  ) => {
    const database = new CountingD1Database();
    migrate(database.sqlite);
    seedSuccessfulRequest(database.sqlite);
    seedBusyModelSlots(database.sqlite);
    database.injectSettlementFault("success", faults);
    configureRuntime(database);
    vi.stubGlobal("fetch", vi.fn(async () => successfulModelResponse()));

    const { POST } = await import("@/../app/api/recommendations/route");
    const response = await POST(await recommendationRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      modelFallback: false,
      creditCharged: 1,
      creditBalance: 24,
    });
    expect(database.settlementFaultsInjected).toBe(faults.length);
    expect(database.statements).toHaveLength(expectedStatements);
    expect(database.statements.length).toBeLessThanOrEqual(50);
  });

  it.each([
    ["rolls back after the last write", ["rollback"] as const, 47],
    ["commits but loses the batch acknowledgement", ["ack-uncertain"] as const, 44],
    ["rolls back once, then commits without an acknowledgement", ["rollback", "ack-uncertain"] as const, 48],
  ])("keeps a cold slot-four failed-model settlement within 50 statements when it %s", async (
    _scenario,
    faults,
    expectedStatements,
  ) => {
    const database = new CountingD1Database();
    migrate(database.sqlite);
    seedSuccessfulRequest(database.sqlite);
    seedBusyModelSlots(database.sqlite);
    database.injectSettlementFault("failure", faults);
    configureRuntime(database);
    vi.stubGlobal("fetch", vi.fn(async () => providerFailureResponse()));

    const { POST } = await import("@/../app/api/recommendations/route");
    const response = await POST(await recommendationRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      provider: "local-rules",
      modelFallback: true,
      fallbackReason: "provider-error",
      creditCharged: 0,
      creditBalance: 25,
    });
    expect(database.settlementFaultsInjected).toBe(faults.length);
    expect(database.statements).toHaveLength(expectedStatements);
    expect(database.statements.length).toBeLessThanOrEqual(50);
  });

  it("does not persist a replay delivery when model quota is denied before reservation", async () => {
    const database = new CountingD1Database();
    migrate(database.sqlite);
    seedSuccessfulRequest(database.sqlite);
    const nowIso = new Date().toISOString();
    const insertUsage = database.sqlite.prepare(`INSERT INTO model_usage_events
      (id, user_id, network_hash, created_at) VALUES (?, ?, NULL, ?)`);
    for (let index = 0; index < 20; index += 1) {
      insertUsage.run(`seed-usage-${index}`, USER_ID, nowIso);
    }
    configureRuntime(database);
    vi.stubGlobal("fetch", vi.fn(async () => successfulModelResponse()));

    const { POST } = await import("@/../app/api/recommendations/route");
    const response = await POST(await recommendationRequest());
    const payload = await response.json() as { modelFallback: boolean; fallbackReason: string };

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ modelFallback: true, fallbackReason: "rate-limit" });
    expect(database.sqlite.prepare("SELECT COUNT(*) AS total FROM model_advice_deliveries").get())
      .toEqual({ total: 0 });
    expect(database.sqlite.prepare("SELECT COUNT(*) AS total FROM ai_credit_ledger").get())
      .toEqual({ total: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not persist a replay delivery when available credit loses a reservation race", async () => {
    const database = new CountingD1Database();
    migrate(database.sqlite);
    seedSuccessfulRequest(database.sqlite);
    database.beforeNextModelQuotaInsert = () => {
      database.sqlite.prepare("UPDATE ai_credit_lots SET remaining_credits = 0 WHERE user_id = ?")
        .run(USER_ID);
    };
    configureRuntime(database);
    vi.stubGlobal("fetch", vi.fn(async () => successfulModelResponse()));

    const { POST } = await import("@/../app/api/recommendations/route");
    const response = await POST(await recommendationRequest());
    const payload = await response.json() as { modelFallback: boolean; fallbackReason: string };

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ modelFallback: true, fallbackReason: "no-credits" });
    expect(database.sqlite.prepare("SELECT COUNT(*) AS total FROM model_advice_deliveries").get())
      .toEqual({ total: 0 });
    expect(database.sqlite.prepare("SELECT COUNT(*) AS total FROM ai_credit_ledger").get())
      .toEqual({ total: 0 });
    expect(database.sqlite.prepare("SELECT COUNT(*) AS total FROM model_usage_events").get())
      .toEqual({ total: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });
});

function configureRuntime(database: CountingD1Database) {
  Object.assign(workerRuntime.env, {
    DB: database,
    APP_ENV: "test",
    BETTER_AUTH_URL: "http://localhost:3000",
    BETTER_AUTH_SECRET: AUTH_SECRET,
    PROMO_REDEMPTION_PEPPER: PROMO_PEPPER,
    DEEPSEEK_ENABLED: "true",
    DEEPSEEK_API_KEY: "test-api-key",
    DEEPSEEK_BASE_URL: "https://api.deepseek.com",
    DEEPSEEK_MODEL: "deepseek-v4-flash",
    DEEPSEEK_DAILY_BUDGET_CNY: "200",
  });
}

async function recommendationRequest() {
  const signature = await makeSignature(SESSION_TOKEN, AUTH_SECRET);
  const target = targetProfiles.find((profile) => profile.track === "career")!;
  return new Request("http://localhost:3000/api/recommendations", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `better-auth.session_token=${SESSION_TOKEN}.${signature}`,
      origin: "http://localhost:3000",
      "x-forwarded-for": "203.0.113.10",
    },
    body: JSON.stringify({
      requestId: REQUEST_ID,
      resumeId: RESUME_ID,
      targetProfileId: target.id,
      allowExternalModel: true,
      section: "basics",
    }),
  });
}

function migrate(sqlite: DatabaseSync) {
  sqlite.exec("PRAGMA foreign_keys = ON");
  const migrationDirectory = resolve(process.cwd(), "drizzle");
  for (const migration of readdirSync(migrationDirectory).filter((name) => /^\d+_.+\.sql$/.test(name)).sort()) {
    sqlite.exec(readFileSync(resolve(migrationDirectory, migration), "utf8")
      .replaceAll("--> statement-breakpoint", ""));
  }
}

function seedSuccessfulRequest(sqlite: DatabaseSync) {
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + 86_400_000).toISOString();
  const target = targetProfiles.find((profile) => profile.track === "career")!;
  sqlite.prepare(`INSERT INTO users
      (id, name, email, email_verified, role, banned, phone_number_verified,
        two_factor_enabled, created_at, updated_at)
    VALUES (?, 'Budget User', 'budget@example.com', 1, 'user', 0, 0, 1, ?, ?)`)
    .run(USER_ID, nowIso, nowIso);
  sqlite.prepare(`INSERT INTO auth_sessions
      (id, expires_at, token, created_at, updated_at, user_id, admin_mfa_verified_at)
    VALUES ('budget-session', ?, ?, ?, ?, ?, ?)`)
    .run(expiresAt, SESSION_TOKEN, nowIso, nowIso, USER_ID, nowIso);
  sqlite.prepare(`INSERT INTO legal_acceptances
      (id, user_id, terms_version, privacy_version, acceptance_method, accepted_at)
    VALUES ('budget-legal', ?, 'terms-2026-09-01-v2', 'privacy-2026-09-01-v1', 'consent-page', ?)`)
    .run(USER_ID, nowIso);

  // The catalog is intentionally left empty. This dangling catalog reference
  // becomes valid when the cold-start initializer performs its two bulk seeds,
  // allowing the test to include the initializer's maximum five statements.
  sqlite.exec("PRAGMA foreign_keys = OFF");
  const content = createBlankContent();
  content.basics = {
    name: "Budget User",
    email: "budget@example.com",
    phone: "",
    location: "Shanghai",
    website: "",
    headline: "Software Engineer",
  };
  sqlite.prepare(`INSERT INTO resumes
      (id, user_id, title, track, target_profile_id, target_name, template_id,
        status, progress, revision, schema_version, content_json, created_at, updated_at)
    VALUES (?, ?, 'Budget Resume', 'career', ?, ?, 'summit', 'draft', 50, 1, 1, ?, ?, ?)`)
    .run(RESUME_ID, USER_ID, target.id, target.name, JSON.stringify(content), nowIso, nowIso);
  sqlite.exec("PRAGMA foreign_keys = ON");
}

function seedBusyModelSlots(sqlite: DatabaseSync) {
  const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
  const insert = sqlite.prepare(`INSERT INTO model_request_leases
    (slot, request_id, expires_at) VALUES (?, ?, ?)`);
  for (let slot = 1; slot <= 3; slot += 1) {
    insert.run(slot, `busy-slot-${slot}`, expiresAt);
  }
}

function successfulModelResponse() {
  return new Response(JSON.stringify({
    status: "completed",
    output: [{
      type: "message",
      content: [{
        type: "output_text",
        text: JSON.stringify({
          score: 86,
          headline: "基础信息完整",
          suggestions: [{
            id: "headline",
            severity: "low",
            title: "保持定位清晰",
            detail: "当前职业定位清晰，可继续用事实支撑。",
          }],
          keywords: ["Software Engineer"],
          rewrite: "Software Engineer",
          rewriteProposals: [],
        }),
      }],
    }],
    usage: {
      input_tokens: 1_000,
      output_tokens: 200,
      input_tokens_details: { cached_tokens: 100 },
    },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

function providerFailureResponse() {
  return new Response("provider unavailable", { status: 503 });
}

type SettlementKind = "success" | "failure";
type SettlementFault = "rollback" | "ack-uncertain";

class CountingD1Database {
  readonly sqlite = new DatabaseSync(":memory:");
  readonly statements: string[] = [];
  beforeNextModelQuotaInsert?: () => void;
  settlementFaultsInjected = 0;
  private settlementFault?: { kind: SettlementKind; faults: readonly SettlementFault[] };

  injectSettlementFault(kind: SettlementKind, faults: readonly SettlementFault[]) {
    this.settlementFault = { kind, faults };
  }

  prepare(sql: string) {
    return new CountingD1Statement(this, sql);
  }

  async exec(sql: string) {
    this.count(sql);
    this.sqlite.exec(sql);
    return { count: 1, duration: 0 };
  }

  async batch(statements: CountingD1Statement[]) {
    const settlementFault = this.settlementFault
      && this.settlementFaultsInjected < this.settlementFault.faults.length
      && statements.some((statement) => statement.isSettlement(this.settlementFault!.kind))
      ? this.settlementFault.faults[this.settlementFaultsInjected]
      : undefined;
    let committed = false;
    this.sqlite.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.runForBatch());
      if (settlementFault === "rollback") {
        this.settlementFaultsInjected += 1;
        throw new Error("injected late settlement rollback");
      }
      this.sqlite.exec("COMMIT");
      committed = true;
      if (settlementFault === "ack-uncertain") {
        this.settlementFaultsInjected += 1;
        throw new Error("injected lost settlement acknowledgement");
      }
      return results;
    } catch (error) {
      if (!committed) this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  count(sql: string) {
    if (this.beforeNextModelQuotaInsert && /INSERT INTO model_usage_events/i.test(sql)) {
      const callback = this.beforeNextModelQuotaInsert;
      this.beforeNextModelQuotaInsert = undefined;
      callback();
    }
    this.statements.push(sql.replace(/\s+/g, " ").trim());
  }
}

class CountingD1Statement {
  private values: unknown[] = [];

  constructor(
    private readonly database: CountingD1Database,
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async first<T>(column?: string) {
    this.database.count(this.sql);
    const row = this.database.sqlite.prepare(this.sql).get(...this.values as never[]) as Record<string, unknown> | undefined;
    if (column) return (row?.[column] ?? null) as T | null;
    return (row ?? null) as T | null;
  }

  async all<T>() {
    this.database.count(this.sql);
    const rows = this.database.sqlite.prepare(this.sql).all(...this.values as never[]) as T[];
    return this.result(rows, this.lastChanges());
  }

  async run() {
    this.database.count(this.sql);
    return this.executeRun();
  }

  async runForBatch() {
    this.database.count(this.sql);
    return this.executeRun();
  }

  isSettlement(kind: SettlementKind) {
    return kind === "success"
      ? /UPDATE\s+ai_credit_ledger\s+SET[\s\S]*status\s*=\s*'consumed'/i.test(this.sql)
      : /UPDATE\s+ai_credit_ledger\s+SET[\s\S]*status\s*=\s*'released'/i.test(this.sql);
  }

  private executeRun() {
    const result = this.database.sqlite.prepare(this.sql).run(...this.values as never[]);
    return this.result([], Number(result.changes), Number(result.lastInsertRowid));
  }

  private lastChanges() {
    const row = this.database.sqlite.prepare("SELECT changes() AS changes").get() as { changes: number };
    return Number(row.changes);
  }

  private result<T>(results: T[], changes: number, lastRowId?: number) {
    return {
      success: true,
      results,
      changes,
      meta: {
        changes,
        ...(lastRowId === undefined ? {} : { last_row_id: lastRowId }),
      },
    };
  }
}
