import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  answerAgentJob, applyAgentJob, cancelAgentJob, claimAgentJob, createAgentJob,
  finishAgentJob, heartbeatAgentJob, maintainAgentJobs, ownedAgentJob,
  type AgentUsage,
} from "@/lib/agent-jobs";
import type { AgentInput, AgentJob, AgentResult } from "@/lib/agent-contract";
import { publicAgentRuntime, type CodexRuntimeConfig } from "@/lib/agent-runtime";
import { createBlankContent } from "@/lib/sample-data";

const NOW = new Date("2026-09-12T16:30:00.000Z");
const config: CodexRuntimeConfig = {
  enabled: true, secret: "runner-test-secret-at-least-32-characters", model: "codex-test-model",
  jobBudgetMicros: 1_000_000, dailyBudgetMicros: 10_000_000,
  maxJobsPerDay: 3, maxModelCalls: 6, maxOutputTokens: 4_000,
};
const usage: AgentUsage = { inputTokens: 100, cachedInputTokens: 20, outputTokens: 50, costMicros: 25_000, modelCalls: 1 };

describe("durable Codex task transactions", () => {
  let adapter: SqliteD1;
  let db: D1Database;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    adapter = new SqliteD1();
    db = adapter as unknown as D1Database;
    seed(adapter.sqlite, "owner", "resume-1");
  });
  afterEach(() => {
    adapter.sqlite.close();
    vi.useRealTimers();
  });

  const create = (database: D1Database, requestId = "request-1", resumeId = "resume-1", userId = "owner", runtime = config) =>
    createAgentJob(database, userId, runtime, { resumeId, expectedRevision: 1, expectedBriefRevision: 1, requestId });

  async function readyJob(database: D1Database) {
    const job = await create(database);
    const claimed = await claimAgentJob(database, config, "worker-1");
    expect(claimed?.id).toBe(job.id);
    const output = result(claimed!.input);
    expect(await finishAgentJob(database, job.id, claimed!.leaseToken, claimed!.attempt, usage, output)).toEqual({ accepted: true });
    const row = await ownedAgentJob(database, job.id, "owner");
    return { job, row, output, claimed: claimed! };
  }

  it("creates one job and one retained budget reservation on repeated identical requests", async () => {
    const [first, concurrentReplay] = await Promise.all([create(db), create(db)]);
    expect(concurrentReplay.id).toBe(first.id);
    expect(await create(db)).toEqual(first);
    expect(adapter.count("agent_jobs")).toBe(1);
    expect(adapter.count("agent_budget_ledger")).toBe(1);
    expect(adapter.sqlite.prepare("SELECT reserved_micros FROM agent_budget_ledger").get()).toEqual({ reserved_micros: config.jobBudgetMicros });
    await expect(createAgentJob(db, "owner", config, { resumeId: "resume-1", expectedRevision: 2, expectedBriefRevision: 1, requestId: "request-1" }))
      .rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_CONFLICT" });
    seed(adapter.sqlite, "owner", "resume-2");
    await expect(create(db, "request-1", "resume-2")).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("enforces ownership before reads, answers, cancellation or candidate application", async () => {
    seed(adapter.sqlite, "other", "other-resume");
    const job = await create(db);
    for (const operation of [
      () => ownedAgentJob(db, job.id, "other"),
      () => answerAgentJob(db, job.id, "other", job.version, []),
      () => cancelAgentJob(db, job.id, "other", job.version),
      () => applyAgentJob(db, job.id, "other", applyRequest(job.version)),
      () => create(db, "other-request", "resume-1", "other"),
    ]) await expect(operation()).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect((await ownedAgentJob(db, job.id, "owner")).status).toBe("queued");
  });

  it("rejects unsaved or stale targets and leaves no queued job or budget reservation", async () => {
    await expect(createAgentJob(db, "owner", config, { resumeId: "resume-1", expectedRevision: 2, expectedBriefRevision: 1, requestId: "stale-resume" }))
      .rejects.toMatchObject({ code: "CONFLICT" });
    await expect(createAgentJob(db, "owner", config, { resumeId: "resume-1", expectedRevision: 1, expectedBriefRevision: 2, requestId: "stale-brief" }))
      .rejects.toMatchObject({ code: "CONFLICT" });
    adapter.sqlite.exec("UPDATE resume_target_briefs SET requirements_text=''");
    await expect(create(db)).rejects.toMatchObject({ status: 422 });
    expect(adapter.count("agent_jobs")).toBe(0);
    expect(adapter.count("agent_budget_ledger")).toBe(0);
  });

  it("atomically limits each user's accepted jobs even across different resumes", async () => {
    seed(adapter.sqlite, "owner", "resume-2");
    const limited = { ...config, maxJobsPerDay: 1 };
    const attempts = await Promise.allSettled([create(db, "one", "resume-1", "owner", limited), create(db, "two", "resume-2", "owner", limited)]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.find((attempt) => attempt.status === "rejected")).toMatchObject({ reason: { code: "RESOURCE_LIMIT_REACHED" } });
    expect(adapter.count("agent_jobs")).toBe(1);
    expect(adapter.count("agent_budget_ledger")).toBe(1);
    const successful = attempts.find((attempt) => attempt.status === "fulfilled") as PromiseFulfilledResult<AgentJob>;
    await cancelAgentJob(db, successful.value.id, "owner", successful.value.version);
    adapter.sqlite.prepare("DELETE FROM agent_jobs WHERE id=?").run(successful.value.id);
    expect(adapter.count("agent_budget_ledger")).toBe(1);
    await expect(create(db, "after-delete", "resume-1", "owner", limited)).rejects.toMatchObject({ code: "RESOURCE_LIMIT_REACHED" });
  });

  it("atomically reserves the global platform budget across owners and rolls back a missing reservation", async () => {
    seed(adapter.sqlite, "other", "other-resume");
    const limited = { ...config, dailyBudgetMicros: config.jobBudgetMicros };
    const attempts = await Promise.allSettled([create(db, "one", "resume-1", "owner", limited), create(db, "two", "other-resume", "other", limited)]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(adapter.count("agent_jobs")).toBe(1);
    expect(adapter.sqlite.prepare("SELECT SUM(reserved_micros) AS reserved FROM agent_budget_ledger").get()).toEqual({ reserved: config.jobBudgetMicros });
    adapter.sqlite.exec("CREATE TRIGGER reject_test_budget BEFORE INSERT ON agent_budget_ledger BEGIN SELECT RAISE(ABORT, 'budget reservation unavailable'); END;");
    seed(adapter.sqlite, "third", "third-resume");
    await expect(create(db, "three", "third-resume", "third")).rejects.toThrow("budget reservation unavailable");
    expect(adapter.count("agent_jobs")).toBe(1);
    expect(adapter.count("agent_budget_ledger")).toBe(1);
  });

  it("claims a queued job once and creates its execution record in the same write", async () => {
    const job = await create(db);
    const claims = await Promise.all([claimAgentJob(db, config, "worker-1"), claimAgentJob(db, config, "worker-2")]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    const claim = claims.find(Boolean)!;
    expect(claim).toMatchObject({ id: job.id, attempt: 1, budgetMicros: config.jobBudgetMicros, maxModelCalls: config.maxModelCalls });
    expect(adapter.count("agent_job_runs")).toBe(1);
    expect(adapter.sqlite.prepare("SELECT id,attempt,state FROM agent_job_runs").get()).toEqual({ id: claim.leaseToken, attempt: 1, state: "running" });
    expect((await ownedAgentJob(db, job.id, "owner")).version).toBe(job.version + 1);
  });

  it("fences heartbeat tokens and attempts and never renews a cancelled lease", async () => {
    const job = await create(db);
    const claim = (await claimAgentJob(db, config, "worker"))!;
    expect(await heartbeatAgentJob(db, job.id, "wrong-token", claim.attempt, "整理中")).toBe(false);
    expect(await heartbeatAgentJob(db, job.id, claim.leaseToken, claim.attempt + 1, "整理中")).toBe(false);
    vi.setSystemTime(new Date(NOW.getTime() + 30_000));
    expect(await heartbeatAgentJob(db, job.id, claim.leaseToken, claim.attempt, "候选整理中")).toBe(true);
    const running = await ownedAgentJob(db, job.id, "owner");
    expect(running.lease_expires_at).toBe(new Date(NOW.getTime() + 120_000).toISOString());
    const cancelled = await cancelAgentJob(db, job.id, "owner", running.version);
    expect(await heartbeatAgentJob(db, job.id, claim.leaseToken, claim.attempt, "继续整理")).toBe(false);
    expect(await finishAgentJob(db, job.id, claim.leaseToken, claim.attempt, usage, result(claim.input))).toEqual({ accepted: true });
    expect((await ownedAgentJob(db, job.id, "owner")).status).toBe("cancelled");
    expect((await ownedAgentJob(db, job.id, "owner")).version).toBe(cancelled.version);
    expect(adapter.sqlite.prepare("SELECT state,cost_micros FROM agent_job_runs").get()).toEqual({ state: "cancelled", cost_micros: usage.costMicros });
    expect(adapter.count("agent_budget_ledger")).toBe(1);
  });

  it("accepts answers only for every current question, redacts them, and requeues with remaining budget", async () => {
    const job = await create(db);
    const claim = (await claimAgentJob(db, config, "worker"))!;
    await finishAgentJob(db, job.id, claim.leaseToken, claim.attempt, usage, questions());
    const waiting = await ownedAgentJob(db, job.id, "owner");
    expect(waiting.status).toBe("waiting_input");
    for (const answers of [[], [{ questionId: "unasked", text: "内容" }], [{ questionId: "q1", text: "内容" }, { questionId: "q1", text: "更多" }]]) {
      await expect(answerAgentJob(db, job.id, "owner", waiting.version, answers)).rejects.toMatchObject({ status: 422 });
    }
    const queued = await answerAgentJob(db, job.id, "owner", waiting.version, [{ questionId: "q1", text: "完成模块开发，联系 member@example.com。" }]);
    expect(queued.status).toBe("queued");
    expect(queued.result).toBeNull();
    expect(queued.version).toBe(waiting.version + 1);
    expect(queued.input.answers).toEqual([{ questionId: "q1", question: "你具体完成哪个模块？", text: "完成模块开发，联系 [邮箱已隐藏]。" }]);
    await expect(answerAgentJob(db, job.id, "owner", waiting.version, [{ questionId: "q1", text: "再次回答" }])).rejects.toMatchObject({ code: "CONFLICT" });
    const resumed = (await claimAgentJob(db, config, "worker"))!;
    expect(resumed.attempt).toBe(2);
    expect(resumed.leaseToken).not.toBe(claim.leaseToken);
    expect(resumed.budgetMicros).toBe(config.jobBudgetMicros - usage.costMicros);
    expect(resumed.maxModelCalls).toBe(config.maxModelCalls - usage.modelCalls);
    expect(resumed.input.answers).toEqual(queued.input.answers);
    expect(adapter.count("agent_budget_ledger")).toBe(1);
    expect(await heartbeatAgentJob(db, job.id, claim.leaseToken, claim.attempt, "旧执行")).toBe(false);
    expect(await finishAgentJob(db, job.id, claim.leaseToken, claim.attempt, usage, result(claim.input))).toEqual({ accepted: false });
  });

  it.each(["resume", "brief"] as const)("rejects answers when the current %s has changed since the questions were generated", async (resource) => {
    const job = await create(db);
    const claim = (await claimAgentJob(db, config, "worker"))!;
    await finishAgentJob(db, job.id, claim.leaseToken, claim.attempt, usage, questions());
    const waiting = await ownedAgentJob(db, job.id, "owner");
    adapter.sqlite.exec(resource === "resume"
      ? "UPDATE resumes SET revision=revision+1 WHERE id='resume-1'"
      : "UPDATE resume_target_briefs SET revision=revision+1 WHERE resume_id='resume-1'");
    await expect(answerAgentJob(db, job.id, "owner", waiting.version, [{ questionId: "q1", text: "完成模块开发。" }])).rejects.toMatchObject({ code: "CONFLICT" });
    expect(JSON.parse((await ownedAgentJob(db, job.id, "owner")).input_json).answers).toHaveLength(0);
    expect(adapter.count("agent_job_runs")).toBe(1);
  });

  it.each(["resume", "brief"] as const)("does not execute queued material after its %s changes", async (resource) => {
    await create(db);
    adapter.sqlite.exec(resource === "resume"
      ? "UPDATE resumes SET revision=revision+1 WHERE id='resume-1'"
      : "UPDATE resume_target_briefs SET revision=revision+1 WHERE resume_id='resume-1'");
    expect(await claimAgentJob(db, config, "worker")).toBeNull();
    expect(adapter.count("agent_job_runs")).toBe(0);
    expect(adapter.count("agent_budget_ledger")).toBe(1);
  });

  it("keeps the first terminal output and usage when the same callback is delivered again", async () => {
    const { job, row, claimed } = await readyJob(db);
    expect(row.status).toBe("ready");
    const different = result(claimed.input);
    different.proposals[0].draftText = "另一份后到的候选。";
    expect(await finishAgentJob(db, job.id, claimed.leaseToken, claimed.attempt, { ...usage, costMicros: 999_999 }, different)).toEqual({ accepted: true });
    const after = await ownedAgentJob(db, job.id, "owner");
    expect(after.result_json).toBe(row.result_json);
    expect(after.version).toBe(row.version);
    expect(adapter.sqlite.prepare("SELECT cost_micros FROM agent_job_runs").get()).toEqual({ cost_micros: usage.costMicros });
  });

  it("fails closed for invalid source references while settling actual execution usage", async () => {
    const job = await create(db);
    const claim = (await claimAgentJob(db, config, "worker"))!;
    const bad = result(claim.input);
    bad.proposals[0].evidenceIds = ["answer:unasked"];
    await finishAgentJob(db, job.id, claim.leaseToken, claim.attempt, usage, bad);
    const failed = await ownedAgentJob(db, job.id, "owner");
    expect(failed.status).toBe("failed");
    expect(failed.result_json).toBeNull();
    expect(adapter.sqlite.prepare("SELECT state,failure_code,cost_micros FROM agent_job_runs").get()).toEqual({ state: "failed", failure_code: "invalid_result", cost_micros: usage.costMicros });
    expect(await claimAgentJob(db, config, "worker")).toBeNull();
  });

  it("commits selected edits, revision and snapshot together and replays apply without another revision", async () => {
    const { job, row, output } = await readyJob(db);
    const applied = await applyAgentJob(db, job.id, "owner", applyRequest(row.version));
    expect(applied.job.status).toBe("applied");
    expect(applied.job.appliedRevision).toBe(2);
    expect(applied.resume.revision).toBe(2);
    expect(applied.resume.content.summary).toBe(output.proposals[0].draftText);
    const snapshot = adapter.sqlite.prepare("SELECT revision,content_json FROM resume_versions WHERE resume_id='resume-1' AND revision=2").get() as { revision: number; content_json: string };
    expect(snapshot.revision).toBe(applied.resume.revision);
    expect(JSON.parse(snapshot.content_json)).toEqual(applied.resume.content);
    const replay = await applyAgentJob(db, job.id, "owner", applyRequest(row.version));
    expect(replay.job.version).toBe(applied.job.version);
    expect(replay.resume.revision).toBe(2);
    expect(adapter.count("resume_versions")).toBe(2);
    await expect(applyAgentJob(db, job.id, "owner", { ...applyRequest(row.version), proposalIds: ["different"] }))
      .rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("rolls back both the job and resume if snapshot persistence fails", async () => {
    const { job, row } = await readyJob(db);
    const before = adapter.sqlite.prepare("SELECT content_json,revision FROM resumes WHERE id='resume-1'").get();
    adapter.failAfterSnapshot = true;
    await expect(applyAgentJob(db, job.id, "owner", applyRequest(row.version))).rejects.toThrow("injected snapshot failure");
    expect((await ownedAgentJob(db, job.id, "owner")).status).toBe("ready");
    expect(adapter.sqlite.prepare("SELECT content_json,revision FROM resumes WHERE id='resume-1'").get()).toEqual(before);
    expect(adapter.count("resume_versions")).toBe(1);
    expect((await applyAgentJob(db, job.id, "owner", applyRequest(row.version))).resume.revision).toBe(2);
  });

  it("reconciles a committed apply after its acknowledgement is lost", async () => {
    const { job, row } = await readyJob(db);
    adapter.loseApplyAcknowledgement = true;
    await expect(applyAgentJob(db, job.id, "owner", applyRequest(row.version))).rejects.toThrow("injected lost acknowledgement");
    expect((await ownedAgentJob(db, job.id, "owner")).status).toBe("applied");
    expect((await applyAgentJob(db, job.id, "owner", applyRequest(row.version))).resume.revision).toBe(2);
    expect(adapter.count("resume_versions")).toBe(2);
  });

  it.each(["resume", "brief"] as const)("rejects a %s revision race immediately before the atomic apply", async (resource) => {
    const { job, row } = await readyJob(db);
    adapter.beforeApplyBatch = () => adapter.sqlite.exec(resource === "resume"
      ? "UPDATE resumes SET revision=revision+1 WHERE id='resume-1'"
      : "UPDATE resume_target_briefs SET revision=revision+1 WHERE resume_id='resume-1'");
    await expect(applyAgentJob(db, job.id, "owner", applyRequest(row.version))).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await ownedAgentJob(db, job.id, "owner")).status).toBe("ready");
    expect(adapter.count("resume_versions")).toBe(1);
  });

  it("rejects a changed brief even when the user submits that brief's current revision", async () => {
    const { job, row } = await readyJob(db);
    adapter.sqlite.exec("UPDATE resume_target_briefs SET revision=2,requirements_text='新的岗位要求' WHERE resume_id='resume-1'");
    await expect(applyAgentJob(db, job.id, "owner", { ...applyRequest(row.version), expectedBriefRevision: 2 })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(adapter.count("resume_versions")).toBe(1);
    expect((await ownedAgentJob(db, job.id, "owner")).status).toBe("ready");
  });

  it("marks expired leases unknown without automatically retrying or reviving late output", async () => {
    const job = await create(db);
    const claim = (await claimAgentJob(db, config, "worker"))!;
    vi.setSystemTime(new Date(NOW.getTime() + 90_001));
    expect(await heartbeatAgentJob(db, job.id, claim.leaseToken, claim.attempt, "过期回调")).toBe(false);
    await maintainAgentJobs(db);
    const failed = await ownedAgentJob(db, job.id, "owner");
    expect(failed.status).toBe("failed");
    expect(adapter.sqlite.prepare("SELECT state,failure_code FROM agent_job_runs").get()).toEqual({ state: "unknown", failure_code: "lease_expired" });
    expect(await claimAgentJob(db, config, "another-worker")).toBeNull();
    await finishAgentJob(db, job.id, claim.leaseToken, claim.attempt, usage, result(claim.input));
    expect((await ownedAgentJob(db, job.id, "owner")).status).toBe("failed");
    expect((await ownedAgentJob(db, job.id, "owner")).result_json).toBeNull();
    expect(adapter.count("agent_job_runs")).toBe(1);
    expect(adapter.count("agent_budget_ledger")).toBe(1);
  });

  it("deletes expired task content while retaining conservative platform reservations", async () => {
    const job = await create(db);
    const claim = (await claimAgentJob(db, config, "worker"))!;
    vi.setSystemTime(new Date(NOW.getTime() + 7 * 86_400_000 + 1));
    await maintainAgentJobs(db);
    expect(adapter.count("agent_jobs")).toBe(0);
    expect(adapter.count("agent_job_runs")).toBe(0);
    expect(adapter.count("agent_budget_ledger")).toBe(1);
    await expect(ownedAgentJob(db, job.id, "owner")).rejects.toMatchObject({ status: 404 });
    expect(await finishAgentJob(db, job.id, claim.leaseToken, claim.attempt, usage, result(claim.input))).toEqual({ accepted: false });
  });

  it("rejects expired applied and cancelled replays before returning retained material", async () => {
    const { job, row } = await readyJob(db);
    await applyAgentJob(db, job.id, "owner", applyRequest(row.version));
    seed(adapter.sqlite, "owner", "resume-cancelled");
    const cancelJob = await create(db, "request-cancelled", "resume-cancelled");
    const cancelled = await cancelAgentJob(db, cancelJob.id, "owner", cancelJob.version);
    vi.setSystemTime(new Date(NOW.getTime() + 7 * 86_400_000 + 1));
    // The maintenance sweep has not run yet: these checks must not depend on deletion.
    expect(adapter.count("agent_jobs")).toBe(2);
    await expect(applyAgentJob(db, job.id, "owner", applyRequest(row.version)))
      .rejects.toMatchObject({ status: 410, code: "IDEMPOTENCY_EXPIRED" });
    await expect(cancelAgentJob(db, cancelJob.id, "owner", cancelled.version))
      .rejects.toMatchObject({ status: 410, code: "IDEMPOTENCY_EXPIRED" });
    expect(adapter.sqlite.prepare("SELECT revision FROM resumes WHERE id='resume-1'").get()).toEqual({ revision: 2 });
  });

  it("persists price version and measured or reserved basis without overwriting a settled receipt", async () => {
    for (const basis of ["measured", "reserved"] as const) {
      const job = await create(db, `price-${basis}`);
      const claim = (await claimAgentJob(db, config, "worker"))!;
      const pricedUsage = { ...usage, priceVersion: `official-price-${basis}`, costBasis: basis };
      await finishAgentJob(db, job.id, claim.leaseToken, claim.attempt, pricedUsage, null, "EXECUTION_FAILED");
      expect(adapter.sqlite.prepare("SELECT price_version,cost_basis,cost_micros FROM agent_job_runs WHERE id=?").get(claim.leaseToken))
        .toEqual({ price_version: `official-price-${basis}`, cost_basis: basis, cost_micros: usage.costMicros });
      await finishAgentJob(db, job.id, claim.leaseToken, claim.attempt,
        { ...usage, priceVersion: "wrong-late-version", costBasis: "measured" }, null, "LATE_CALLBACK");
      expect(adapter.sqlite.prepare("SELECT price_version,cost_basis FROM agent_job_runs WHERE id=?").get(claim.leaseToken))
        .toEqual({ price_version: `official-price-${basis}`, cost_basis: basis });
    }
  });

  it("keeps the runtime online past 120 seconds while a valid task heartbeat continues", async () => {
    const job = await create(db);
    const claim = (await claimAgentJob(db, config, "worker"))!;
    vi.setSystemTime(new Date(NOW.getTime() + 70_000));
    expect(await heartbeatAgentJob(db, job.id, claim.leaseToken, claim.attempt, "分析中")).toBe(true);
    vi.setSystemTime(new Date(NOW.getTime() + 130_000));
    expect(await heartbeatAgentJob(db, job.id, claim.leaseToken, claim.attempt, "校验中")).toBe(true);
    const runtime = adapter.sqlite.prepare("SELECT last_seen_at FROM agent_runtime_state WHERE id='codex'").get() as { last_seen_at: string };
    expect(runtime.last_seen_at).toBe(new Date().toISOString());
    expect(publicAgentRuntime(config, runtime.last_seen_at).enabled).toBe(true);
    expect(publicAgentRuntime(config, NOW.toISOString()).enabled).toBe(false);
    expect((await ownedAgentJob(db, job.id, "owner")).status).toBe("running");
  });

  it("blocks further questions when the execution budget is exhausted", async () => {
    const job = await create(db);
    const claim = (await claimAgentJob(db, config, "worker"))!;
    await finishAgentJob(db, job.id, claim.leaseToken, claim.attempt, { ...usage, costMicros: config.jobBudgetMicros }, questions());
    const failed = await ownedAgentJob(db, job.id, "owner");
    expect(failed.status).toBe("failed");
    expect(failed.result_json).toBeNull();
    expect(adapter.sqlite.prepare("SELECT failure_code FROM agent_job_runs").get()).toEqual({ failure_code: "budget_exhausted" });
    expect(await claimAgentJob(db, config, "worker")).toBeNull();
  });

  it("enforces cumulative model-call limits across answered rounds", async () => {
    const limited = { ...config, maxModelCalls: 2 };
    const job = await create(db, "request-1", "resume-1", "owner", limited);
    const first = (await claimAgentJob(db, limited, "worker"))!;
    await finishAgentJob(db, job.id, first.leaseToken, first.attempt, usage, questions());
    const waiting = await ownedAgentJob(db, job.id, "owner");
    await answerAgentJob(db, job.id, "owner", waiting.version, [{ questionId: "q1", text: "完成权限配置模块。" }]);
    const second = (await claimAgentJob(db, limited, "worker"))!;
    expect(second.maxModelCalls).toBe(1);
    await finishAgentJob(db, job.id, second.leaseToken, second.attempt, { ...usage, modelCalls: 2 }, result(second.input));
    expect((await ownedAgentJob(db, job.id, "owner")).status).toBe("failed");
    expect(adapter.sqlite.prepare("SELECT SUM(model_calls) AS calls FROM agent_job_runs").get()).toEqual({ calls: 3 });
    expect(adapter.sqlite.prepare("SELECT failure_code FROM agent_job_runs WHERE attempt=2").get()).toEqual({ failure_code: "budget_exhausted" });
    expect(await claimAgentJob(db, limited, "worker")).toBeNull();
  });

  it("does not claim a requeued task whose persisted allowance has been exhausted", async () => {
    const job = await create(db);
    const first = (await claimAgentJob(db, config, "worker"))!;
    await finishAgentJob(db, job.id, first.leaseToken, first.attempt, usage, questions());
    const waiting = await ownedAgentJob(db, job.id, "owner");
    await answerAgentJob(db, job.id, "owner", waiting.version, [{ questionId: "q1", text: "完成权限模块。" }]);
    // Simulate a persisted allowance tightened to already-settled spend before
    // the next claim; dispatch must still consult authoritative run accounting.
    adapter.sqlite.prepare("UPDATE agent_jobs SET budget_micros=? WHERE id=?").run(usage.costMicros, job.id);
    expect(await claimAgentJob(db, config, "worker")).toBeNull();
    expect(adapter.count("agent_job_runs")).toBe(1);
    expect((await ownedAgentJob(db, job.id, "owner")).attempt).toBe(1);
    expect(adapter.count("agent_budget_ledger")).toBe(1);
  });

  it("ends the third round instead of creating another unanswered execution", async () => {
    const job = await create(db);
    for (let attempt = 1; attempt <= 3; attempt++) {
      const claim = (await claimAgentJob(db, config, "worker"))!;
      const nextQuestions = questions();
      nextQuestions.questions[0].id = `q${attempt}`;
      await finishAgentJob(db, job.id, claim.leaseToken, claim.attempt, usage, nextQuestions);
      const row = await ownedAgentJob(db, job.id, "owner");
      if (attempt < 3) {
        expect(row.status).toBe("waiting_input");
        await answerAgentJob(db, job.id, "owner", row.version, [{ questionId: `q${attempt}`, text: "按已知事实描述个人贡献。" }]);
      } else {
        expect(row.status).toBe("failed");
        expect(row.result_json).toBeNull();
        await expect(answerAgentJob(db, job.id, "owner", row.version, [{ questionId: "q3", text: "第四轮回答" }])).rejects.toMatchObject({ code: "CONFLICT" });
      }
    }
    expect(await claimAgentJob(db, config, "worker")).toBeNull();
    expect(adapter.count("agent_job_runs")).toBe(3);
    expect(adapter.count("agent_budget_ledger")).toBe(1);
  });
});

function result(input: AgentInput): AgentResult {
  const source = input.sources[0];
  return {
    summary: "整理了模块实现经历，请核对后使用。", questions: [],
    proposals: [{ id: "proposal-1", sourceId: source.id, originalText: source.text,
      draftText: "完成后台系统的权限配置模块开发。", rationale: "突出具体模块与贡献。", evidenceIds: [source.id], warnings: [] }],
    interview: [{ question: "你实现了哪个模块？", answerOutline: "结合权限配置模块说明实现过程。", evidenceIds: [source.id] }],
  };
}
function questions(): AgentResult {
  return { summary: "需要补充个人贡献。", questions: [{ id: "q1", question: "你具体完成哪个模块？", reason: "区分个人与团队职责。" }], proposals: [], interview: [] };
}
function applyRequest(version: number) {
  return { expectedVersion: version, expectedRevision: 1, expectedBriefRevision: 1, proposalIds: ["proposal-1"] };
}

function seed(sqlite: DatabaseSync, owner: string, resumeId: string) {
  const now = NOW.toISOString();
  sqlite.prepare("INSERT OR IGNORE INTO users(id,name,email,role,banned,created_at,updated_at) VALUES(?,?,?,'user',0,?,?)").run(owner, owner, `${owner}@example.test`, now, now);
  sqlite.prepare(`INSERT OR IGNORE INTO templates(id,name,description,track,accent,layout,tags_json,recommended_for_json,created_at,updated_at)
    VALUES('test-template','模板','测试模板','all','#123456','classic','[]','[]',?,?)`).run(now, now);
  const content = createBlankContent();
  content.summary = "参与后台系统开发，完成权限配置模块。";
  sqlite.prepare(`INSERT INTO resumes(id,user_id,title,track,target_name,template_id,status,progress,revision,content_json,created_at,updated_at)
    VALUES(?,?,?,'career','后端工程师','test-template','draft',20,1,?,?,?)`).run(resumeId, owner, "目标简历", JSON.stringify(content), now, now);
  sqlite.prepare(`INSERT INTO resume_target_briefs(resume_id,user_id,kind,focus_name,requirements_text,source_type,captured_at,revision,created_at,updated_at)
    VALUES(?,?,'career-job','平台研发','负责权限管理与后台系统开发','manual',?,1,?,?)`).run(resumeId, owner, now, now, now);
  sqlite.prepare("INSERT INTO resume_versions(id,resume_id,revision,content_json,created_at) VALUES(?,?,1,?,?)").run(`initial-${resumeId}`, resumeId, JSON.stringify(content), now);
}

/** Real SQLite constraints/triggers and atomic batches emulate D1, including RETURNING. */
class SqliteD1 {
  readonly sqlite = new DatabaseSync(":memory:");
  beforeApplyBatch?: () => void;
  failAfterSnapshot = false;
  loseApplyAcknowledgement = false;
  constructor() {
    this.sqlite.exec("PRAGMA foreign_keys=ON");
    const directory = resolve(process.cwd(), "drizzle");
    for (const file of readdirSync(directory).filter((name) => /^\d+_.+\.sql$/.test(name)).sort()) {
      this.sqlite.exec(readFileSync(resolve(directory, file), "utf8").replaceAll("--> statement-breakpoint", ""));
    }
  }
  count(table: "agent_jobs" | "agent_budget_ledger" | "agent_job_runs" | "resume_versions") {
    return Number((this.sqlite.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get() as { total: number }).total);
  }
  prepare(sql: string) { return new SqliteStatement(this.sqlite, sql); }
  async batch(statements: SqliteStatement[]) {
    const applying = statements.some((statement) => /INSERT INTO resume_versions/.test(statement.sql));
    if (applying && this.beforeApplyBatch) { const callback = this.beforeApplyBatch; this.beforeApplyBatch = undefined; callback(); }
    this.sqlite.exec("BEGIN");
    let committed = false;
    try {
      // No asynchronous gap inside the transaction, matching SQLite's serialized writer.
      const results = statements.map((statement) => {
        const result = statement.execute();
        if (this.failAfterSnapshot && /INSERT INTO resume_versions/.test(statement.sql)) {
          this.failAfterSnapshot = false;
          throw new Error("injected snapshot failure");
        }
        return result;
      });
      this.sqlite.exec("COMMIT");
      committed = true;
      if (applying && this.loseApplyAcknowledgement) {
        this.loseApplyAcknowledgement = false;
        throw new Error("injected lost acknowledgement");
      }
      return results;
    } catch (error) {
      if (!committed) this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }
}
class SqliteStatement {
  private values: unknown[] = [];
  constructor(private readonly sqlite: DatabaseSync, readonly sql: string) {}
  bind(...values: unknown[]) { this.values = values; return this; }
  async first<T>() { return (this.sqlite.prepare(this.sql).get(...this.values as never[]) ?? null) as T | null; }
  async run() { return this.execute(); }
  execute() {
    const statement = this.sqlite.prepare(this.sql);
    const returnsRows = /\bRETURNING\b|^\s*SELECT\b/i.test(this.sql);
    const results = returnsRows ? statement.all(...this.values as never[]) : [];
    const changes = returnsRows
      ? Number((this.sqlite.prepare("SELECT changes() AS count").get() as { count: number }).count)
      : Number(statement.run(...this.values as never[]).changes);
    return { success: true, results, meta: { changes } };
  }
}
