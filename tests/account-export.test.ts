import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { getDatabase } from "@/../db";
import {
  ACCOUNT_EXPORT_MAX_CONTENT_BYTES,
  ACCOUNT_EXPORT_MAX_RECORDS,
  AccountExportTooLargeError,
  assertAccountExportEstimate,
  buildAccountExport,
} from "@/lib/account-export";

type Database = ReturnType<typeof getDatabase>;

describe("account data export", () => {
  it("accepts an export estimate at the configured limits", () => {
    expect(() => assertAccountExportEstimate({
      recordCount: ACCOUNT_EXPORT_MAX_RECORDS,
      contentBytes: ACCOUNT_EXPORT_MAX_CONTENT_BYTES,
    })).not.toThrow();
  });

  it("rejects an export estimate above the record limit", () => {
    expect(() => assertAccountExportEstimate({
      recordCount: ACCOUNT_EXPORT_MAX_RECORDS + 1,
      contentBytes: 0,
    })).toThrow(AccountExportTooLargeError);
  });

  it("rejects an export estimate above the content-byte limit", () => {
    expect(() => assertAccountExportEstimate({
      recordCount: 1,
      contentBytes: ACCOUNT_EXPORT_MAX_CONTENT_BYTES + 1,
    })).toThrow(AccountExportTooLargeError);
  });

  it("exports user-owned records without authentication or replay secrets", async () => {
    const adapter = createDatabase();
    const now = "2026-09-01T00:00:00.000Z";
    adapter.sqlite.exec(`
      INSERT INTO users
        (id, name, email, email_verified, role, banned, phone_number_verified,
         two_factor_enabled, created_at, updated_at)
        VALUES ('user-1', 'Export User', 'export@example.com', 1, 'user', 0, 0, 1, '${now}', '${now}');
      INSERT INTO auth_accounts
        (id, issuer, account_id, provider_id, user_id, access_token, refresh_token, id_token,
         password, created_at, updated_at)
        VALUES ('account-1', 'github', 'provider-user', 'github', 'user-1',
          'ACCESS_SENTINEL', 'REFRESH_SENTINEL', 'ID_SENTINEL', 'PASSWORD_SENTINEL', '${now}', '${now}');
      INSERT INTO auth_sessions
        (id, expires_at, token, created_at, updated_at, user_id, admin_mfa_verified_at)
        VALUES ('session-1', '2026-09-02T00:00:00.000Z', 'SESSION_SENTINEL', '${now}', '${now}', 'user-1', '${now}');
      INSERT INTO auth_two_factors
        (id, secret, backup_codes, user_id, verified)
        VALUES ('factor-1', 'TOTP_SENTINEL', 'BACKUP_SENTINEL', 'user-1', 1);
      INSERT INTO model_advice_deliveries
        (request_id, user_id, resume_id, request_fingerprint, response_json, attempt_state,
         updated_at, created_at, expires_at, terminal_at)
        VALUES ('request-1', 'user-1', 'resume-1', 'FINGERPRINT_SENTINEL',
          '{"private":"REPLAY_SENTINEL"}', 'succeeded', '${now}', '${now}',
          '2026-09-01T00:15:00.000Z', '${now}');
    `);

    const payload = await buildAccountExport(
      adapter as unknown as Database,
      "user-1",
      now,
    );
    expect(payload).toMatchObject({
      schemaVersion: 1,
      generatedAt: now,
      user: { id: "user-1", email: "export@example.com" },
      identity: { accounts: [{ provider_id: "github" }], sessions: [{ id: "session-1" }] },
      aiCredits: { requestHistory: [{ request_id: "request-1", attempt_state: "succeeded" }] },
    });

    const serialized = JSON.stringify(payload);
    for (const sentinel of [
      "ACCESS_SENTINEL",
      "REFRESH_SENTINEL",
      "ID_SENTINEL",
      "PASSWORD_SENTINEL",
      "SESSION_SENTINEL",
      "TOTP_SENTINEL",
      "BACKUP_SENTINEL",
      "FINGERPRINT_SENTINEL",
      "REPLAY_SENTINEL",
    ]) expect(serialized).not.toContain(sentinel);
    expect(recursiveKeys(payload)).not.toEqual(expect.arrayContaining([
      "access_token",
      "refresh_token",
      "id_token",
      "password",
      "token",
      "secret",
      "backup_codes",
      "request_fingerprint",
      "response_json",
    ]));
  });

  it("exports owned Codex material, consent and usage without execution capabilities", async () => {
    const adapter = createDatabase();
    seedAgentJob(adapter.sqlite, "owner", "job-owner");
    seedAgentJob(adapter.sqlite, "other", "job-other");

    const payload = await buildAccountExport(adapter as unknown as Database, "owner");
    expect(payload.schemaVersion).toBe(1);
    expect(payload.agentTasks.jobs).toEqual([expect.objectContaining({
      id: "job-owner", resume_id: "resume-owner", status: "running", version: 1,
      input_json: JSON.stringify({ sources: ["owner 经历"], answers: ["本人补充"] }),
      result_json: JSON.stringify({ summary: "owner 候选", interview: ["沟通提纲"] }),
      consent_version: "codex-material-v1", base_resume_revision: 1, base_brief_revision: 0,
      applied_proposal_ids_json: '["proposal-1"]',
    })]);
    expect(payload.agentTasks.runs).toEqual([expect.objectContaining({
      job_id: "job-owner", attempt: 1, state: "running", input_tokens: 180,
      cached_input_tokens: 80, output_tokens: 40, model_calls: 1, cost_micros: 250,
      price_version: "test-price-v1", cost_basis: "measured",
    })]);
    expect(payload.agentTasks.runs[0]).not.toHaveProperty("id");
    expect(payload.agentTasks.budgetReservations).toEqual([expect.objectContaining({
      job_id: "job-owner", reserved_micros: 10000,
    })]);
    const serialized = JSON.stringify(payload);
    for (const value of ["LEASE_SENTINEL", "APPLY_SENTINEL", "job-other", "other 经历", "other 候选"]) {
      expect(serialized).not.toContain(value);
    }
    expect(recursiveKeys(payload)).not.toEqual(expect.arrayContaining(["lease_token", "apply_token", "lease_expires_at"]));
    expect(adapter.sqlite.prepare("SELECT id FROM agent_job_runs WHERE job_id='job-owner'").get())
      .toEqual({ id: "LEASE_SENTINEL-job-owner" });
  });

  it.each(["input_json", "result_json", "applied_proposal_ids_json"])("includes %s in the preflight UTF-8 budget", async (field) => {
    const adapter = createDatabase();
    seedAgentJob(adapter.sqlite, "owner", "job-owner");
    adapter.sqlite.prepare(`UPDATE agent_jobs SET ${field}=? WHERE id='job-owner'`).run(oversizedJson());

    await expect(buildAccountExport(adapter as unknown as Database, "owner"))
      .rejects.toBeInstanceOf(AccountExportTooLargeError);
    expect(adapter.queries).toHaveLength(1);
  });

  it.each(["input_json", "result_json", "applied_proposal_ids_json"])("rechecks %s bytes when material grows after preflight", async (field) => {
    const adapter = createDatabase(() => {
      adapter.sqlite.prepare(`UPDATE agent_jobs SET ${field}=? WHERE id='job-owner'`).run(oversizedJson());
    });
    seedAgentJob(adapter.sqlite, "owner", "job-owner");

    await expect(buildAccountExport(adapter as unknown as Database, "owner"))
      .rejects.toBeInstanceOf(AccountExportTooLargeError);
    expect(adapter.queries.length).toBeGreaterThan(1);
  });

  it("includes Codex reservations in both record-count budget checks", async () => {
    for (const growAfterEstimate of [false, true]) {
      const adapter = createDatabase(growAfterEstimate ? () => insertBudgetRows(adapter.sqlite) : undefined);
      seedAgentJob(adapter.sqlite, "owner", "job-owner");
      if (!growAfterEstimate) insertBudgetRows(adapter.sqlite);
      await expect(buildAccountExport(adapter as unknown as Database, "owner"))
        .rejects.toBeInstanceOf(AccountExportTooLargeError);
      expect(adapter.queries.length > 1).toBe(growAfterEstimate);
    }
  });
});

function oversizedJson() {
  // Chinese text has three UTF-8 bytes per character. Character-count checks
  // would incorrectly allow this otherwise valid JSON through.
  return JSON.stringify("证".repeat(Math.ceil(ACCOUNT_EXPORT_MAX_CONTENT_BYTES / 3)));
}

function insertBudgetRows(sqlite: DatabaseSync) {
  sqlite.exec(`WITH RECURSIVE rows(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM rows WHERE n<${ACCOUNT_EXPORT_MAX_RECORDS})
    INSERT INTO agent_budget_ledger(job_id,user_id,reserved_micros,created_at)
      SELECT 'budget-'||n,'owner',100,'2026-09-01T00:00:00.000Z' FROM rows`);
}

function seedAgentJob(sqlite: DatabaseSync, owner: string, jobId: string) {
  const now = "2026-09-01T00:00:00.000Z";
  sqlite.prepare(`INSERT INTO users(id,name,email,created_at,updated_at) VALUES (?,?,?,?,?)`)
    .run(owner, owner, `${owner}@example.com`, now, now);
  sqlite.prepare(`INSERT OR IGNORE INTO templates
    (id,name,description,track,accent,layout,tags_json,recommended_for_json,created_at,updated_at)
    VALUES ('export-template','Export','Test','career','#123456','classic','[]','[]',?,?)`).run(now, now);
  sqlite.prepare(`INSERT INTO resumes
    (id,user_id,title,track,target_name,template_id,content_json,created_at,updated_at)
    VALUES (?,?,'Export','career','Target','export-template','{}',?,?)`).run(`resume-${owner}`, owner, now, now);
  sqlite.prepare(`INSERT INTO agent_jobs
    (id,user_id,resume_id,request_id,status,base_resume_revision,base_brief_revision,input_json,result_json,
      stage,model,budget_micros,max_model_calls,max_output_tokens,consent_version,created_at,updated_at,expires_at,
      apply_token,applied_proposal_ids_json)
    VALUES (?,?,?,?,'queued',1,0,?,?,'queued','codex-test',10000,2,512,'codex-material-v1',?,?,?,?,'["proposal-1"]')`)
    .run(jobId, owner, `resume-${owner}`, `request-${jobId}`,
      JSON.stringify({ sources: [`${owner} 经历`], answers: ["本人补充"] }),
      JSON.stringify({ summary: `${owner} 候选`, interview: ["沟通提纲"] }),
      now, now, "2026-10-01T00:00:00.000Z", `APPLY_SENTINEL-${jobId}`);
  sqlite.prepare("UPDATE agent_jobs SET status='running',attempt=1,lease_token=? WHERE id=?")
    .run(`LEASE_SENTINEL-${jobId}`, jobId);
  sqlite.prepare(`UPDATE agent_job_runs SET input_tokens=180,cached_input_tokens=80,
    output_tokens=40,model_calls=1,cost_micros=250,price_version='test-price-v1',cost_basis='measured' WHERE job_id=?`).run(jobId);
}

function recursiveKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(recursiveKeys);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, nested]) => [key, ...recursiveKeys(nested)]);
}

function createDatabase(afterEstimate?: () => void) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const migrationDirectory = resolve(process.cwd(), "drizzle");
  for (const migration of readdirSync(migrationDirectory).filter((name) => /^\d+_.+\.sql$/.test(name)).sort()) {
    sqlite.exec(readFileSync(resolve(migrationDirectory, migration), "utf8")
      .replaceAll("--> statement-breakpoint", ""));
  }
  const queries: string[] = [];
  return {
    sqlite,
    queries,
    prepare: (sql: string) => { queries.push(sql); return new Statement(sqlite, sql, afterEstimate); },
  };
}

class Statement {
  private values: unknown[] = [];
  constructor(private readonly sqlite: DatabaseSync, private readonly sql: string, private readonly afterEstimate?: () => void) {}
  bind(...values: unknown[]) { this.values = values; return this; }
  async first<T>() {
    const row = (this.sqlite.prepare(this.sql).get(...this.values as never[]) ?? null) as T | null;
    if (this.sql.includes("export_estimate(record_count")) this.afterEstimate?.();
    return row;
  }
  async all<T>() {
    return { results: this.sqlite.prepare(this.sql).all(...this.values as never[]) as T[] };
  }
}
