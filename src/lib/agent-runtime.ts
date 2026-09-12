import type { AgentRuntime } from "./agent-contract";

export interface CodexRuntimeConfig {
  enabled: boolean;
  secret: string;
  model: string;
  jobBudgetMicros: number;
  dailyBudgetMicros: number;
  maxJobsPerDay: number;
  maxModelCalls: number;
  maxOutputTokens: number;
}

function integer(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : fallback;
  return Number.isSafeInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export function codexRuntimeConfig(env: Record<string, unknown>): CodexRuntimeConfig {
  const secret = typeof env.CODEX_RUNNER_SECRET === "string" ? env.CODEX_RUNNER_SECRET : "";
  const model = typeof env.CODEX_MODEL === "string" ? env.CODEX_MODEL : "";
  const jobBudgetMicros = integer(env.CODEX_JOB_BUDGET_MICROS, 0, 1, 100_000_000);
  const dailyBudgetMicros = integer(env.CODEX_DAILY_BUDGET_MICROS, 0, 1, 10_000_000_000);
  return {
    enabled: env.CODEX_AGENT_ENABLED === "true" && secret.length >= 32
      && ![env.MAINTENANCE_SECRET, env.BETTER_AUTH_SECRET].includes(secret)
      && /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,99}$/.test(model)
      && jobBudgetMicros > 0 && dailyBudgetMicros >= jobBudgetMicros,
    secret, model, jobBudgetMicros, dailyBudgetMicros,
    maxJobsPerDay: integer(env.CODEX_MAX_JOBS_PER_DAY, 3, 1, 20),
    maxModelCalls: integer(env.CODEX_MAX_MODEL_CALLS, 6, 1, 12),
    maxOutputTokens: integer(env.CODEX_MAX_OUTPUT_TOKENS, 4000, 512, 8000),
  };
}

export function publicAgentRuntime(config: CodexRuntimeConfig, lastSeen: string | null, now = Date.now()): AgentRuntime {
  const elapsed = lastSeen === null ? NaN : now - Date.parse(lastSeen);
  const online = elapsed >= 0 && elapsed < 120_000;
  return {
    enabled: config.enabled && online,
    reason: !config.enabled ? "Codex 任务服务待配置" : !online ? "Codex 执行服务暂未连接，请稍后再试" : null,
    billingMode: "sponsored-preview",
    maxJobsPerDay: config.maxJobsPerDay,
  };
}
