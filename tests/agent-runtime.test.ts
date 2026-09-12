import { describe, expect, it } from "vitest";
import { codexRuntimeConfig, publicAgentRuntime } from "@/lib/agent-runtime";

const configured = {
  CODEX_AGENT_ENABLED: "true", CODEX_RUNNER_SECRET: "independent-runner-secret-with-32-characters",
  CODEX_MODEL: "codex-test-model", CODEX_JOB_BUDGET_MICROS: "1000000", CODEX_DAILY_BUDGET_MICROS: "3000000",
};

describe("Codex execution availability and budget configuration", () => {
  it("requires an explicit opt-in, independent credential, model and a funded platform budget", () => {
    expect(codexRuntimeConfig(configured).enabled).toBe(true);
    for (const changed of [
      { CODEX_AGENT_ENABLED: "false" }, { CODEX_AGENT_ENABLED: true },
      { CODEX_RUNNER_SECRET: "short" }, { BETTER_AUTH_SECRET: configured.CODEX_RUNNER_SECRET },
      { MAINTENANCE_SECRET: configured.CODEX_RUNNER_SECRET },
      { CODEX_MODEL: "unsafe model;command" }, { CODEX_MODEL: "" },
      { CODEX_JOB_BUDGET_MICROS: "0" }, { CODEX_DAILY_BUDGET_MICROS: "999999" },
      { CODEX_JOB_BUDGET_MICROS: "-1" }, { CODEX_DAILY_BUDGET_MICROS: "Infinity" },
    ]) expect(codexRuntimeConfig({ ...configured, ...changed }).enabled).toBe(false);
    expect(codexRuntimeConfig({}).enabled).toBe(false);
  });

  it("bounds execution counts and output limits and does not accept fractional budget strings", () => {
    expect(codexRuntimeConfig({ ...configured, CODEX_MAX_JOBS_PER_DAY: "20", CODEX_MAX_MODEL_CALLS: "12", CODEX_MAX_OUTPUT_TOKENS: "8000" }))
      .toMatchObject({ enabled: true, maxJobsPerDay: 20, maxModelCalls: 12, maxOutputTokens: 8000 });
    expect(codexRuntimeConfig({ ...configured, CODEX_MAX_JOBS_PER_DAY: "21", CODEX_MAX_MODEL_CALLS: "13", CODEX_MAX_OUTPUT_TOKENS: "8001" }))
      .toMatchObject({ maxJobsPerDay: 3, maxModelCalls: 6, maxOutputTokens: 4000 });
    expect(codexRuntimeConfig({ ...configured, CODEX_JOB_BUDGET_MICROS: "1000000.5" }).enabled).toBe(false);
    expect(codexRuntimeConfig({ ...configured, CODEX_JOB_BUDGET_MICROS: "100000001" }).enabled).toBe(false);
    expect(codexRuntimeConfig({ ...configured, CODEX_DAILY_BUDGET_MICROS: "10000000001" }).enabled).toBe(false);
  });

  it("reports availability only for a configured executor with a recent valid heartbeat", () => {
    const runtime = codexRuntimeConfig(configured);
    const now = Date.parse("2026-09-12T16:30:00.000Z");
    expect(publicAgentRuntime(runtime, new Date(now - 119_999).toISOString(), now))
      .toEqual({ enabled: true, reason: null, billingMode: "sponsored-preview", maxJobsPerDay: 3 });
    for (const seen of [null, "invalid", new Date(now - 120_000).toISOString()]) {
      expect(publicAgentRuntime(runtime, seen, now)).toMatchObject({ enabled: false, reason: expect.any(String) });
    }
    expect(publicAgentRuntime({ ...runtime, enabled: false }, new Date(now).toISOString(), now).enabled).toBe(false);
    expect(publicAgentRuntime(runtime, new Date(now + 86_400_000).toISOString(), now).enabled).toBe(false);
  });

  it("never exposes credentials or private cost configuration through public runtime", () => {
    const runtime = codexRuntimeConfig(configured);
    const value = publicAgentRuntime(runtime, new Date().toISOString());
    expect(Object.keys(value).sort()).toEqual(["billingMode", "enabled", "maxJobsPerDay", "reason"]);
    expect(JSON.stringify(value)).not.toContain(configured.CODEX_RUNNER_SECRET);
  });
});
