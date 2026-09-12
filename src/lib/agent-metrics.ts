import type { getDatabase } from "@/../db";
import type { AdminAgentMetrics } from "@/types/resume";
import { codexRuntimeConfig, publicAgentRuntime } from "./agent-runtime";

type Database = ReturnType<typeof getDatabase>;
const statuses = ["queued", "running", "waiting_input", "ready", "applied", "failed", "cancelled", "expired"] as const;

/** Admin-only aggregate data: never select job material or execution tokens. */
export async function getAgentMetrics(db: Database, environment: Record<string, unknown>, now = new Date()): Promise<AdminAgentMetrics> {
  if (!Number.isFinite(now.getTime())) throw new TypeError("Metrics snapshot time is invalid");
  const generatedAt = now.toISOString();
  const sinceSevenDays = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const sinceTwentyFourHours = new Date(now.getTime() - 86_400_000).toISOString();
  const config = codexRuntimeConfig(environment);
  const configurationReady = codexRuntimeConfig({ ...environment, CODEX_AGENT_ENABLED: "true" }).enabled;
  const [counts, cohort, budget, usage, runner] = await Promise.all([
    db.prepare("SELECT status, COUNT(*) AS count FROM agent_jobs GROUP BY status")
      .all<{ status: string; count: number }>(),
    db.prepare(`SELECT COUNT(*) AS created_jobs,
        COALESCE(SUM(CASE WHEN status IN ('ready','applied') THEN 1 ELSE 0 END),0) AS delivered_jobs,
        COALESCE(SUM(CASE WHEN status='applied' THEN 1 ELSE 0 END),0) AS applied_jobs,
        COALESCE(SUM(CASE WHEN status IN ('ready','applied','failed','cancelled','expired') THEN 1 ELSE 0 END),0) AS closed_jobs
      FROM agent_jobs WHERE created_at>=? AND created_at<=?`)
      .bind(sinceSevenDays, generatedAt).first<{ created_jobs: number; delivered_jobs: number; applied_jobs: number; closed_jobs: number }>(),
    // The ledger deliberately outlives deleted jobs/accounts. It reserves each
    // complete job cap and is not reduced to the cost in a partial callback.
    db.prepare(`SELECT COALESCE(SUM(reserved_micros),0) AS reserved_micros
      FROM agent_budget_ledger WHERE created_at>=? AND created_at<=?`)
      .bind(sinceTwentyFourHours, generatedAt).first<{ reserved_micros: number }>(),
    db.prepare(`SELECT
        COALESCE(SUM(CASE WHEN cost_basis='measured' AND state IN ('succeeded','failed','cancelled') AND settled_at IS NOT NULL THEN cost_micros ELSE 0 END),0) AS returned_cost_micros,
        COALESCE(SUM(CASE WHEN cost_basis='measured' AND state IN ('succeeded','failed','cancelled') AND settled_at IS NOT NULL THEN 1 ELSE 0 END),0) AS returned_runs,
        COALESCE(SUM(CASE WHEN cost_basis='reserved' AND settled_at IS NOT NULL THEN cost_micros ELSE 0 END),0) AS conservative_cost_micros,
        COALESCE(SUM(CASE WHEN cost_basis='reserved' AND settled_at IS NOT NULL THEN 1 ELSE 0 END),0) AS conservative_runs,
        COALESCE(SUM(CASE WHEN state='unknown' OR (cost_basis IN ('reserved','unknown') AND model_calls>0) THEN 1 ELSE 0 END),0) AS unknown_runs,
        COALESCE(SUM(CASE WHEN state<>'unknown' AND (state='running' OR settled_at IS NULL) THEN 1 ELSE 0 END),0) AS unsettled_runs
      FROM agent_job_runs WHERE created_at>=? AND created_at<=?`)
      .bind(sinceTwentyFourHours, generatedAt).first<{
        returned_cost_micros: number; returned_runs: number; conservative_cost_micros: number;
        conservative_runs: number; unknown_runs: number; unsettled_runs: number;
      }>(),
    db.prepare("SELECT last_seen_at, model FROM agent_runtime_state WHERE id='codex'")
      .first<{ last_seen_at: string; model: string }>(),
  ]);
  const createdJobs = Number(cohort?.created_jobs ?? 0);
  const deliveredJobs = Number(cohort?.delivered_jobs ?? 0);
  const appliedJobs = Number(cohort?.applied_jobs ?? 0);
  const closedJobs = Number(cohort?.closed_jobs ?? 0);
  const matchingHeartbeat = runner?.model === config.model ? runner.last_seen_at : null;
  const runtime = publicAgentRuntime(config, matchingHeartbeat, now.getTime());
  const heartbeatAge = matchingHeartbeat === null ? NaN : now.getTime() - Date.parse(matchingHeartbeat);
  return {
    generatedAt,
    sinceSevenDays,
    sinceTwentyFourHours,
    statusCounts: statuses.map((status) => ({ status, count: Number(counts.results.find((item) => item.status === status)?.count ?? 0) })),
    sevenDays: { createdJobs, deliveredJobs, appliedJobs, closedJobs,
      successRate: closedJobs ? deliveredJobs / closedJobs : null,
      applicationRate: deliveredJobs ? appliedJobs / deliveredJobs : null },
    usage24h: {
      currency: "USD",
      retainedReservedUsdMicros: Number(budget?.reserved_micros ?? 0),
      platformCapUsdMicros: config.dailyBudgetMicros,
      returnedEstimatedCostUsdMicros: Number(usage?.returned_cost_micros ?? 0),
      returnedRuns: Number(usage?.returned_runs ?? 0),
      conservativeReportedCostUsdMicros: Number(usage?.conservative_cost_micros ?? 0),
      conservativeRuns: Number(usage?.conservative_runs ?? 0),
      unknownRuns: Number(usage?.unknown_runs ?? 0),
      unsettledRuns: Number(usage?.unsettled_runs ?? 0),
    },
    runtime: {
      switchEnabled: environment.CODEX_AGENT_ENABLED === "true",
      configurationReady,
      acceptingJobs: runtime.enabled,
      runnerOnline: heartbeatAge >= 0 && heartbeatAge < 120_000,
      lastHeartbeatAt: runner?.last_seen_at ?? null,
      model: config.model,
      runnerModel: runner?.model ?? null,
      maxJobsPerDay: config.maxJobsPerDay,
    },
  };
}
