import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { getDatabase } from "@/../db";
import { getAgentMetrics } from "@/lib/agent-metrics";

type Database = ReturnType<typeof getDatabase>;
const now = new Date("2026-09-13T00:00:00.000Z");
const recent = "2026-09-12T23:00:00.000Z";
const old = "2026-09-01T00:00:00.000Z";
const environment = {
  CODEX_AGENT_ENABLED: "true", CODEX_RUNNER_SECRET: "RUNNER_SECRET_SENTINEL_0123456789abcdef",
  CODEX_MODEL: "codex-test", CODEX_JOB_BUDGET_MICROS: "5000", CODEX_DAILY_BUDGET_MICROS: "100000",
};

describe("Codex administration metrics", () => {
  it("returns empty rate denominators as unavailable and performs metadata-only queries", async () => {
    const adapter = createDatabase();
    const result = await getAgentMetrics(adapter as unknown as Database, {}, now);
    expect(result.sevenDays).toEqual({ createdJobs: 0, deliveredJobs: 0, appliedJobs: 0, closedJobs: 0, successRate: null, applicationRate: null });
    expect(result.statusCounts.every((item) => item.count === 0)).toBe(true);
    expect(result.usage24h).toMatchObject({ currency: "USD", returnedEstimatedCostUsdMicros: 0, unknownRuns: 0, unsettledRuns: 0 });
    expect(result.runtime).toMatchObject({ switchEnabled: false, configurationReady: false, runnerOnline: false, acceptingJobs: false, lastHeartbeatAt: null });
    for (const query of adapter.queries) {
      expect(query).not.toMatch(/\b(input_json|result_json|lease_token|apply_token|worker_id)\b/i);
      expect(query).not.toMatch(/SELECT\s+\*/i);
    }
  });

  it("uses a seven-day created cohort and reports explicit delivery and application denominators", async () => {
    const adapter = createDatabase();
    for (const [index, status] of ["ready", "applied", "applied", "failed", "cancelled", "expired", "queued", "running", "waiting_input"].entries()) {
      seedJob(adapter.sqlite, `recent-${index}`, status);
    }
    seedJob(adapter.sqlite, "old-applied", "applied", old);
    const result = await getAgentMetrics(adapter as unknown as Database, environment, now);
    expect(result.sevenDays).toEqual({ createdJobs: 9, deliveredJobs: 3, appliedJobs: 2, closedJobs: 6, successRate: 0.5, applicationRate: 2 / 3 });
    expect(result.statusCounts.find((item) => item.status === "applied")).toEqual({ status: "applied", count: 3 });
    expect(JSON.stringify(result)).not.toContain("PERSONAL_MATERIAL_SENTINEL");
    expect(JSON.stringify(result)).not.toContain("RUNNER_SECRET_SENTINEL");
  });

  it("keeps full retained budget separate from measured, conservative and unknown receipts", async () => {
    const adapter = createDatabase();
    seedJob(adapter.sqlite, "measured", "ready");
    seedRun(adapter.sqlite, "measured", "succeeded", "measured", 230, 1);
    seedJob(adapter.sqlite, "reserved", "failed");
    seedRun(adapter.sqlite, "reserved", "failed", "reserved", 5000, 1);
    seedJob(adapter.sqlite, "unknown", "failed");
    seedRun(adapter.sqlite, "unknown", "unknown", "unknown", 0, 0);
    seedJob(adapter.sqlite, "unsettled", "running");
    seedRun(adapter.sqlite, "unsettled", "running", "unknown", 0, 0);
    seedJob(adapter.sqlite, "old-run", "applied", old);
    seedRun(adapter.sqlite, "old-run", "succeeded", "measured", 90000, 1, old);
    adapter.sqlite.prepare(`INSERT INTO agent_budget_ledger(job_id,user_id,reserved_micros,created_at)
      VALUES ('deleted-job','deleted-agent-budget-anonymous',9000,?)`).run(recent);

    const result = await getAgentMetrics(adapter as unknown as Database, environment, now);
    expect(result.usage24h).toEqual({ currency: "USD", retainedReservedUsdMicros: 29000, platformCapUsdMicros: 100000,
      returnedEstimatedCostUsdMicros: 230, returnedRuns: 1, conservativeReportedCostUsdMicros: 5000,
      conservativeRuns: 1, unknownRuns: 2, unsettledRuns: 1 });
    expect(result.usage24h.retainedReservedUsdMicros).toBeGreaterThan(result.usage24h.returnedEstimatedCostUsdMicros);
    expect(JSON.stringify(result)).not.toContain("LEASE_SENTINEL");
  });

  it("counts unknown-basis callbacks with model work even when their execution has settled", async () => {
    const adapter = createDatabase();
    seedJob(adapter.sqlite, "unknown-receipt", "failed");
    seedRun(adapter.sqlite, "unknown-receipt", "failed", "unknown", 0, 1);
    const result = await getAgentMetrics(adapter as unknown as Database, environment, now);
    expect(result.usage24h).toMatchObject({ unknownRuns: 1, returnedRuns: 0, returnedEstimatedCostUsdMicros: 0, unsettledRuns: 0 });
  });

  it("distinguishes the kill switch, configuration, fresh heartbeat and model mismatch", async () => {
    const adapter = createDatabase();
    const db = adapter as unknown as Database;
    adapter.sqlite.prepare(`INSERT INTO agent_runtime_state(id,last_seen_at,worker_id,model) VALUES ('codex',?,'WORKER_SENTINEL','codex-test')`)
      .run("2026-09-12T23:59:30.000Z");
    expect((await getAgentMetrics(db, environment, now)).runtime).toMatchObject({
      switchEnabled: true, configurationReady: true, runnerOnline: true, acceptingJobs: true,
    });
    expect((await getAgentMetrics(db, { ...environment, CODEX_AGENT_ENABLED: "false" }, now)).runtime).toMatchObject({
      switchEnabled: false, configurationReady: true, runnerOnline: true, acceptingJobs: false,
    });
    adapter.sqlite.prepare("UPDATE agent_runtime_state SET model='different-model'").run();
    expect((await getAgentMetrics(db, environment, now)).runtime).toMatchObject({
      runnerOnline: false, acceptingJobs: false, runnerModel: "different-model", lastHeartbeatAt: "2026-09-12T23:59:30.000Z",
    });
    adapter.sqlite.prepare("UPDATE agent_runtime_state SET model='codex-test',last_seen_at='2026-09-12T23:58:00.000Z'").run();
    expect((await getAgentMetrics(db, environment, now)).runtime.runnerOnline).toBe(false);
    adapter.sqlite.prepare("UPDATE agent_runtime_state SET last_seen_at='2026-09-13T00:00:01.000Z'").run();
    expect((await getAgentMetrics(db, environment, now)).runtime.runnerOnline).toBe(false);
  });
});

function seedJob(sqlite: DatabaseSync, id: string, status: string, createdAt = recent) {
  sqlite.prepare(`INSERT OR IGNORE INTO users(id,name,email,created_at,updated_at)
    VALUES ('owner','Owner','owner@example.com',?,?)`).run(recent, recent);
  sqlite.prepare(`INSERT OR IGNORE INTO templates
    (id,name,description,track,accent,layout,tags_json,recommended_for_json,created_at,updated_at)
    VALUES ('metrics-template','Metrics','Test','career','#123456','classic','[]','[]',?,?)`).run(recent, recent);
  sqlite.prepare(`INSERT OR IGNORE INTO resumes(id,user_id,title,track,target_name,template_id,content_json,created_at,updated_at)
    VALUES ('resume-owner','owner','Metrics','career','Target','metrics-template','{}',?,?)`).run(recent, recent);
  sqlite.prepare(`INSERT INTO agent_jobs
    (id,user_id,resume_id,request_id,status,base_resume_revision,base_brief_revision,input_json,result_json,
      stage,model,budget_micros,max_model_calls,max_output_tokens,consent_version,created_at,updated_at,expires_at)
    VALUES (?,'owner','resume-owner',?,?,1,0,'{"text":"PERSONAL_MATERIAL_SENTINEL"}',
      '{"text":"PERSONAL_RESULT_SENTINEL"}','stage','codex-test',5000,2,512,'codex-v1',?,?,'2026-10-01T00:00:00.000Z')`)
    .run(id, `request-${id}`, status, createdAt, createdAt);
}

function seedRun(sqlite: DatabaseSync, jobId: string, state: string, basis: string, cost: number, calls: number, createdAt = recent) {
  sqlite.prepare(`INSERT INTO agent_job_runs
    (id,job_id,attempt,state,cost_basis,cost_micros,model_calls,price_version,created_at,settled_at)
    VALUES (?,?,1,?,?,?,?,?,?,?)`).run(`LEASE_SENTINEL-${jobId}`, jobId, state, basis, cost, calls, "test-price-v1", createdAt,
      state === "running" ? null : createdAt);
}

function createDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const migrations = resolve(process.cwd(), "drizzle");
  for (const file of readdirSync(migrations).filter((name) => /^\d+_.+\.sql$/.test(name)).sort()) {
    sqlite.exec(readFileSync(resolve(migrations, file), "utf8").replaceAll("--> statement-breakpoint", ""));
  }
  const queries: string[] = [];
  return { sqlite, queries, prepare(sql: string) { queries.push(sql); return new Statement(sqlite, sql); } };
}

class Statement {
  private values: unknown[] = [];
  constructor(private readonly sqlite: DatabaseSync, private readonly sql: string) {}
  bind(...values: unknown[]) { this.values = values; return this; }
  async first<T>() { return (this.sqlite.prepare(this.sql).get(...this.values as never[]) ?? null) as T | null; }
  async all<T>() { return { results: this.sqlite.prepare(this.sql).all(...this.values as never[]) as T[] }; }
}
