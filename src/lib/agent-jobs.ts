import { z } from "zod";
import {
  agentInputSchema, applyAgentProposals, buildAgentInput, redactAgentText, validateAgentResult,
  type AgentJob,
} from "./agent-contract";
import type { CodexRuntimeConfig } from "./agent-runtime";
import { mapResume, mapTargetBrief, type ResumeRow, type TargetBriefRow } from "./db-mappers";
import { calculateProgress } from "./utils";
import type { ApiErrorCode } from "./api";

const DAY = 86_400_000;
const CONSENT = "codex-materials-v1-2026-09-12";
const ACTIVE = "'queued','running','waiting_input','ready'";

export class AgentJobError extends Error {
  constructor(readonly status: number, readonly code: ApiErrorCode, message: string) { super(message); }
}
export interface AgentJobRow {
  id: string; user_id: string; resume_id: string; request_id: string;
  status: AgentJob["status"]; version: number; base_resume_revision: number; base_brief_revision: number;
  input_json: string; result_json: string | null; error: string | null; stage: string;
  model: string; budget_micros: number; max_model_calls: number; max_output_tokens: number;
  attempt: number; lease_token: string | null; lease_expires_at: string | null;
  apply_token: string | null; applied_revision: number | null; applied_proposal_ids_json: string | null;
  created_at: string; updated_at: string; expires_at: string;
}
export const agentUsageSchema = z.object({
  inputTokens: z.number().int().min(0).max(100_000_000),
  cachedInputTokens: z.number().int().min(0).max(100_000_000),
  outputTokens: z.number().int().min(0).max(1_000_000),
  costMicros: z.number().int().min(0).max(10_000_000_000),
  modelCalls: z.number().int().min(0).max(12),
  priceVersion: z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/).optional(),
  costBasis: z.enum(["measured", "reserved"]).optional(),
}).strict().refine((value) => value.cachedInputTokens <= value.inputTokens);
export type AgentUsage = z.infer<typeof agentUsageSchema>;

export function mapAgentJob(row: AgentJobRow): AgentJob {
  return {
    id: row.id, resumeId: row.resume_id, status: row.status, version: row.version,
    baseResumeRevision: row.base_resume_revision, baseBriefRevision: row.base_brief_revision,
    input: agentInputSchema.parse(JSON.parse(row.input_json)),
    result: row.result_json ? JSON.parse(row.result_json) : null,
    error: row.error, stage: row.stage, createdAt: row.created_at, updatedAt: row.updated_at,
    expiresAt: row.expires_at, appliedRevision: row.applied_revision,
  };
}

export async function ownedAgentJob(db: D1Database, id: string, userId: string) {
  const row = await db.prepare(`SELECT j.* FROM agent_jobs j JOIN resumes r ON r.id=j.resume_id
    WHERE j.id=? AND j.user_id=? AND r.user_id=? AND r.deleted_at IS NULL`)
    .bind(id, userId, userId).first<AgentJobRow>();
  if (!row) throw new AgentJobError(404, "NOT_FOUND", "没有找到这项材料任务");
  if (Date.parse(row.expires_at) <= Date.now()) throw new AgentJobError(410, "IDEMPOTENCY_EXPIRED", "任务材料已到期，请使用当前资料创建任务");
  return row;
}

async function ownedResumeAndBrief(db: D1Database, resumeId: string, userId: string) {
  const resume = await db.prepare("SELECT * FROM resumes WHERE id=? AND user_id=? AND deleted_at IS NULL")
    .bind(resumeId, userId).first<ResumeRow>();
  if (!resume) throw new AgentJobError(404, "NOT_FOUND", "没有找到这份简历");
  const brief = await db.prepare("SELECT * FROM resume_target_briefs WHERE resume_id=? AND user_id=?")
    .bind(resumeId, userId).first<TargetBriefRow>();
  return { resume, brief };
}

function checkVersions(row: AgentJobRow, version: number) {
  if (row.version !== version) throw new AgentJobError(409, "CONFLICT", "任务已更新，请重新查看后操作");
  if (Date.parse(row.expires_at) <= Date.now()) throw new AgentJobError(409, "CONFLICT", "材料任务已到期，请创建新任务");
}

function validateMaterials<T>(validate: () => T): T {
  try { return validate(); }
  catch (error) {
    throw new AgentJobError(422, "VALIDATION_ERROR", error instanceof z.ZodError
      ? "请检查材料长度与内容，至少填写一段可用的真实经历" : (error as Error).message);
  }
}

export async function createAgentJob(db: D1Database, userId: string, config: CodexRuntimeConfig, request: {
  resumeId: string; expectedRevision: number; expectedBriefRevision: number; requestId: string;
}) {
  const existing = await db.prepare("SELECT * FROM agent_jobs WHERE user_id=? AND request_id=?")
    .bind(userId, request.requestId).first<AgentJobRow>();
  if (existing) {
    if (existing.resume_id !== request.resumeId || existing.base_resume_revision !== request.expectedRevision
      || existing.base_brief_revision !== request.expectedBriefRevision) {
      throw new AgentJobError(409, "IDEMPOTENCY_CONFLICT", "这次请求标识已用于另一份材料或修订");
    }
    return mapAgentJob(await ownedAgentJob(db, existing.id, userId));
  }
  const { resume, brief } = await ownedResumeAndBrief(db, request.resumeId, userId);
  if (resume.revision !== request.expectedRevision || (brief?.revision ?? 0) !== request.expectedBriefRevision) {
    throw new AgentJobError(409, "CONFLICT", "简历或目标已变化，请保存并刷新后创建任务");
  }
  if (!brief?.focus_name.trim() || !brief.requirements_text.trim()) {
    throw new AgentJobError(422, "VALIDATION_ERROR", "请先保存目标岗位或项目及其要求");
  }
  const input = validateMaterials(() => buildAgentInput({ content: mapResume(resume).content, track: resume.track,
    targetName: resume.target_name, brief: mapTargetBrief(brief) }));
  if (!input.sources.length) throw new AgentJobError(422, "VALIDATION_ERROR", "请先填写至少一段真实经历或项目描述");
  const serialized = JSON.stringify(input);
  if (new TextEncoder().encode(serialized).byteLength > 160_000) {
    throw new AgentJobError(422, "VALIDATION_ERROR", "本次材料较多，请精简经历后再创建任务");
  }
  const now = new Date().toISOString();
  const since = new Date(Date.now() - DAY).toISOString();
  const id = crypto.randomUUID();
  // Conditional insert + budget trigger are a single SQLite transaction.
  const row = await db.prepare(`INSERT INTO agent_jobs
    (id,user_id,resume_id,request_id,status,base_resume_revision,base_brief_revision,input_json,
      stage,model,budget_micros,max_model_calls,max_output_tokens,consent_version,created_at,updated_at,expires_at)
    SELECT ?,?,?,?,'queued',?,?,?,'等待执行',?,?,?,?,?,?,?,?
    WHERE NOT EXISTS(SELECT 1 FROM agent_jobs WHERE user_id=? AND resume_id=? AND status IN (${ACTIVE}) AND expires_at>?)
      AND (SELECT COUNT(*) FROM agent_budget_ledger WHERE user_id=? AND created_at>?) < ?
      AND (SELECT COALESCE(SUM(reserved_micros),0) FROM agent_budget_ledger WHERE created_at>?) + ? <= ?
      AND EXISTS(SELECT 1 FROM resumes WHERE id=? AND user_id=? AND revision=? AND deleted_at IS NULL)
      AND EXISTS(SELECT 1 FROM resume_target_briefs WHERE resume_id=? AND user_id=? AND revision=?)
    ON CONFLICT(user_id,request_id) DO NOTHING RETURNING *`)
    .bind(id, userId, resume.id, request.requestId, resume.revision, brief.revision, serialized,
      config.model, config.jobBudgetMicros, config.maxModelCalls, config.maxOutputTokens, CONSENT,
      now, now, new Date(Date.now() + 7 * DAY).toISOString(),
      userId, resume.id, now, userId, since, config.maxJobsPerDay, since,
      config.jobBudgetMicros, config.dailyBudgetMicros, resume.id, userId, resume.revision,
      resume.id, userId, brief.revision).first<AgentJobRow>();
  if (!row) {
    const duplicate = await db.prepare("SELECT * FROM agent_jobs WHERE user_id=? AND request_id=?")
      .bind(userId, request.requestId).first<AgentJobRow>();
    if (duplicate && duplicate.resume_id === resume.id && duplicate.base_resume_revision === resume.revision
      && duplicate.base_brief_revision === brief.revision) return mapAgentJob(duplicate);
    throw new AgentJobError(409, "RESOURCE_LIMIT_REACHED", "已有进行中的任务，或本日试点额度已用完；请先查看已有任务");
  }
  return mapAgentJob(row);
}

export async function answerAgentJob(db: D1Database, id: string, userId: string, version: number,
  answers: { questionId: string; text: string }[]) {
  const row = await ownedAgentJob(db, id, userId);
  checkVersions(row, version);
  const current = await ownedResumeAndBrief(db, row.resume_id, userId);
  if (current.resume.revision !== row.base_resume_revision || (current.brief?.revision ?? 0) !== row.base_brief_revision) {
    throw new AgentJobError(409, "CONFLICT", "简历或目标已经变化，请取消旧任务并使用最新资料创建任务");
  }
  if (row.status !== "waiting_input" || row.attempt >= 3 || !row.result_json) {
    throw new AgentJobError(409, "CONFLICT", "任务当前不接受补充，请查看最新结果");
  }
  const job = mapAgentJob(row);
  const questions = job.result!.questions;
  if (answers.length !== questions.length || new Set(answers.map((answer) => answer.questionId)).size !== answers.length
    || answers.some((answer) => !questions.some((question) => question.id === answer.questionId))) {
    throw new AgentJobError(422, "VALIDATION_ERROR", "请逐项回答当前问题；不确定时可以写明不知道");
  }
  const input = agentInputSchema.parse({ ...job.input, answers: [...job.input.answers, ...answers.map((answer) => ({
    questionId: answer.questionId, question: questions.find((question) => question.id === answer.questionId)!.question,
    text: redactAgentText(answer.text),
  }))] });
  const updated = await db.prepare(`UPDATE agent_jobs SET input_json=?,result_json=NULL,status='queued',
    version=version+1,stage='补充已保存，等待继续',updated_at=?
    WHERE id=? AND user_id=? AND version=? AND status='waiting_input'
      AND EXISTS(SELECT 1 FROM resumes WHERE id=agent_jobs.resume_id AND revision=agent_jobs.base_resume_revision AND deleted_at IS NULL)
      AND COALESCE((SELECT revision FROM resume_target_briefs WHERE resume_id=agent_jobs.resume_id),0)=base_brief_revision RETURNING *`)
    .bind(JSON.stringify(input), new Date().toISOString(), id, userId, version).first<AgentJobRow>();
  if (!updated) throw new AgentJobError(409, "CONFLICT", "任务刚刚被更新，请刷新");
  return mapAgentJob(updated);
}

export async function cancelAgentJob(db: D1Database, id: string, userId: string, version: number) {
  const current = await ownedAgentJob(db, id, userId);
  if (current.status === "cancelled") return mapAgentJob(current);
  checkVersions(current, version);
  const updated = await db.prepare(`UPDATE agent_jobs SET status='cancelled',version=version+1,
    stage='已取消',updated_at=? WHERE id=? AND user_id=? AND version=? AND status IN (${ACTIVE}) RETURNING *`)
    .bind(new Date().toISOString(), id, userId, version).first<AgentJobRow>();
  if (!updated) throw new AgentJobError(409, "CONFLICT", "任务已结束或发生变化");
  return mapAgentJob(updated);
}

export async function applyAgentJob(db: D1Database, id: string, userId: string, request: {
  expectedVersion: number; expectedRevision: number; expectedBriefRevision: number; proposalIds: string[];
}) {
  const row = await ownedAgentJob(db, id, userId);
  const { resume, brief } = await ownedResumeAndBrief(db, row.resume_id, userId);
  if (row.status === "applied") {
    const applied = JSON.parse(row.applied_proposal_ids_json ?? "[]") as string[];
    if (JSON.stringify([...applied].sort()) !== JSON.stringify([...request.proposalIds].sort())) {
      throw new AgentJobError(409, "IDEMPOTENCY_CONFLICT", "这项任务已经应用了另一组修改");
    }
    return { job: mapAgentJob(row), resume: { ...mapResume(resume), ...(brief ? { targetBrief: mapTargetBrief(brief) } : {}) } };
  }
  checkVersions(row, request.expectedVersion);
  if (row.status !== "ready" || !row.result_json || resume.revision !== row.base_resume_revision
    || request.expectedRevision !== resume.revision || request.expectedBriefRevision !== (brief?.revision ?? 0)
    || row.base_brief_revision !== (brief?.revision ?? 0)) {
    throw new AgentJobError(409, "CONFLICT", "简历、目标或候选已经变化，请基于最新版本创建任务");
  }
  const input = agentInputSchema.parse(JSON.parse(row.input_json));
  const result = validateAgentResult(input, JSON.parse(row.result_json));
  const content = validateMaterials(() => applyAgentProposals(mapResume(resume).content, input, result, request.proposalIds));
  const now = new Date().toISOString();
  const token = crypto.randomUUID();
  // The job is claimed for application inside the SAME batch as the resume
  // write and snapshot. No successful application can be partially committed.
  const writes = await db.batch([
    db.prepare(`UPDATE agent_jobs SET status='applied',version=version+1,apply_token=?,applied_revision=?,
        applied_proposal_ids_json=?,stage='所选修改已保存',updated_at=?
      WHERE id=? AND user_id=? AND version=? AND status='ready'
        AND EXISTS(SELECT 1 FROM resumes WHERE id=? AND user_id=? AND revision=? AND deleted_at IS NULL)
        AND COALESCE((SELECT revision FROM resume_target_briefs WHERE resume_id=? AND user_id=?),0)=? RETURNING *`)
      .bind(token, resume.revision + 1, JSON.stringify(request.proposalIds), now, id, userId, row.version,
        resume.id, userId, resume.revision, resume.id, userId, row.base_brief_revision),
    db.prepare(`UPDATE resumes SET content_json=?,progress=?,revision=revision+1,updated_at=?
      WHERE id=? AND user_id=? AND revision=? AND EXISTS(SELECT 1 FROM agent_jobs WHERE id=? AND apply_token=?) RETURNING *`)
      .bind(JSON.stringify(content), calculateProgress(content), now, resume.id, userId, resume.revision, id, token),
    db.prepare(`INSERT INTO resume_versions(id,resume_id,revision,content_json,created_at)
      SELECT ?,r.id,r.revision,r.content_json,? FROM resumes r JOIN agent_jobs j ON j.resume_id=r.id
      WHERE j.id=? AND j.apply_token=? AND r.revision=j.applied_revision`)
      .bind(crypto.randomUUID(), now, id, token),
  ]);
  const applied = writes[0]?.results[0] as unknown as AgentJobRow | undefined;
  const updated = writes[1]?.results[0] as unknown as ResumeRow | undefined;
  if (!applied || !updated) throw new AgentJobError(409, "CONFLICT", "保存前资料已变化，请刷新后重试");
  return { job: mapAgentJob(applied), resume: { ...mapResume(updated), ...(brief ? { targetBrief: mapTargetBrief(brief) } : {}) } };
}

export async function maintainAgentJobs(db: D1Database, now = new Date().toISOString()) {
  const writes = await db.batch([
    db.prepare(`UPDATE agent_jobs SET status='failed',error='执行中断，请创建新任务；本次不扣点',stage='执行中断',
      version=version+1,updated_at=? WHERE id IN (SELECT id FROM agent_jobs WHERE status='running' AND lease_expires_at<=? LIMIT 100)`).bind(now, now),
    db.prepare(`UPDATE agent_jobs SET status='failed',error='材料已更新或任务额度已用完，请使用最新资料创建任务',
      stage='需要重新准备',version=version+1,updated_at=? WHERE id IN (
      SELECT j.id FROM agent_jobs j JOIN resumes r ON r.id=j.resume_id JOIN users u ON u.id=j.user_id
      WHERE j.status='queued' AND (r.revision<>j.base_resume_revision OR r.deleted_at IS NOT NULL OR u.banned<>0
        OR COALESCE((SELECT revision FROM resume_target_briefs WHERE resume_id=r.id),0)<>j.base_brief_revision
        OR j.attempt>=3 OR j.budget_micros<=(SELECT COALESCE(SUM(cost_micros),0) FROM agent_job_runs WHERE job_id=j.id)
        OR j.max_model_calls<=(SELECT COALESCE(SUM(model_calls),0) FROM agent_job_runs WHERE job_id=j.id)) LIMIT 100)`).bind(now),
    db.prepare(`UPDATE agent_job_runs SET state='unknown',failure_code='lease_expired',settled_at=?
      WHERE id IN(SELECT r.id FROM agent_job_runs r JOIN agent_jobs j ON j.id=r.job_id
        WHERE r.state='running' AND (j.status IN ('failed','expired') OR (j.status='cancelled' AND j.lease_expires_at<=?)) LIMIT 100)`).bind(now, now),
    db.prepare(`DELETE FROM agent_jobs WHERE id IN(SELECT id FROM agent_jobs WHERE expires_at<=? LIMIT 100)`).bind(now),
    db.prepare(`DELETE FROM agent_budget_ledger WHERE job_id IN(SELECT job_id FROM agent_budget_ledger WHERE created_at<? LIMIT 100)`)
      .bind(new Date(Date.parse(now) - 90 * DAY).toISOString()),
  ]);
  const due = await db.prepare(`SELECT
    (SELECT COUNT(*) FROM agent_jobs WHERE expires_at<=?) AS expiredJobs,
    (SELECT COUNT(*) FROM agent_budget_ledger WHERE created_at<?) AS expiredReservations,
    (SELECT COUNT(*) FROM agent_jobs WHERE status='running' AND lease_expires_at<=?) AS interruptedJobs`)
    .bind(now, new Date(Date.parse(now) - 90 * DAY).toISOString(), now)
    .first<{ expiredJobs: number; expiredReservations: number; interruptedJobs: number }>();
  return { changedRows: writes.reduce((sum, item) => sum + Number(item.meta.changes ?? 0), 0), ...due };
}

export async function claimAgentJob(db: D1Database, config: CodexRuntimeConfig, workerId: string) {
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO agent_runtime_state(id,last_seen_at,worker_id,model) VALUES('codex',?,?,?)
    ON CONFLICT(id) DO UPDATE SET last_seen_at=excluded.last_seen_at,worker_id=excluded.worker_id,model=excluded.model`)
    .bind(now, workerId, config.model).run();
  await maintainAgentJobs(db, now);
  await db.prepare(`UPDATE agent_jobs SET status='failed',stage='执行配置已更新',
    error='服务模型已更新，请使用当前资料创建新任务',version=version+1,updated_at=?
    WHERE id IN(SELECT id FROM agent_jobs WHERE status='queued' AND model<>? LIMIT 100)`)
    .bind(now, config.model).run();
  const lease = crypto.randomUUID();
  const row = await db.prepare(`UPDATE agent_jobs SET status='running',version=version+1,attempt=attempt+1,
    lease_token=?,lease_expires_at=?,stage='正在整理目标与证据',updated_at=? WHERE id=(
      SELECT j.id FROM agent_jobs j JOIN users u ON u.id=j.user_id JOIN resumes r ON r.id=j.resume_id
      WHERE j.status='queued' AND j.attempt<3 AND j.expires_at>? AND u.banned=0 AND r.deleted_at IS NULL
        AND r.revision=j.base_resume_revision
        AND COALESCE((SELECT revision FROM resume_target_briefs WHERE resume_id=r.id),0)=j.base_brief_revision
        AND j.model=? AND j.budget_micros>(SELECT COALESCE(SUM(cost_micros),0) FROM agent_job_runs WHERE job_id=j.id)
        AND j.max_model_calls>(SELECT COALESCE(SUM(model_calls),0) FROM agent_job_runs WHERE job_id=j.id)
      ORDER BY j.created_at LIMIT 1)
      AND (SELECT COUNT(*) FROM agent_jobs WHERE status='running')<4 RETURNING *`)
    .bind(lease, new Date(Date.now() + 90_000).toISOString(), now, now, config.model).first<AgentJobRow>();
  if (!row) return null;
  const usage = await db.prepare(`SELECT COALESCE(SUM(cost_micros),0) cost,COALESCE(SUM(model_calls),0) calls
    FROM agent_job_runs WHERE job_id=?`).bind(row.id).first<{ cost: number; calls: number }>();
  return { id: row.id, leaseToken: lease, attempt: row.attempt, input: agentInputSchema.parse(JSON.parse(row.input_json)),
    budgetMicros: row.budget_micros - Number(usage?.cost ?? 0), maxModelCalls: row.max_model_calls - Number(usage?.calls ?? 0),
    maxOutputTokens: row.max_output_tokens, maxDurationMs: 180_000, model: row.model, expiresAt: row.expires_at };
}

export async function heartbeatAgentJob(db: D1Database, id: string, leaseToken: string, attempt: number, stage: string) {
  const now = new Date().toISOString();
  const row = await db.prepare(`UPDATE agent_jobs SET lease_expires_at=?,stage=?,updated_at=?
    WHERE id=? AND lease_token=? AND attempt=? AND status='running' AND lease_expires_at>? AND expires_at>?
      AND EXISTS(SELECT 1 FROM users WHERE id=agent_jobs.user_id AND banned=0)
      AND EXISTS(SELECT 1 FROM resumes WHERE id=agent_jobs.resume_id AND deleted_at IS NULL) RETURNING model`)
    .bind(new Date(Date.now() + 90_000).toISOString(), stage, now, id, leaseToken, attempt, now, now).first<{ model: string }>();
  if (row) await db.prepare("UPDATE agent_runtime_state SET last_seen_at=? WHERE id='codex' AND model=?")
    .bind(now, row.model).run();
  return Boolean(row);
}

export async function finishAgentJob(db: D1Database, id: string, leaseToken: string, attempt: number,
  usage: AgentUsage, output: unknown, failureCode?: string) {
  const row = await db.prepare("SELECT * FROM agent_jobs WHERE id=? AND lease_token=? AND attempt=?")
    .bind(id, leaseToken, attempt).first<AgentJobRow>();
  if (!row) return { accepted: false };
  const run = await db.prepare("SELECT state FROM agent_job_runs WHERE id=? AND job_id=?")
    .bind(leaseToken, id).first<{ state: string }>();
  if (!run || run.state !== "running") return { accepted: true }; // first terminal result wins
  const now = new Date().toISOString();
  let result: ReturnType<typeof validateAgentResult> | null = null;
  let error = failureCode ? "任务暂未完成，请稍后创建新任务；本次不扣点" : null;
  let status: AgentJob["status"] = "failed";
  if (!failureCode) {
    try {
      result = validateAgentResult(agentInputSchema.parse(JSON.parse(row.input_json)), output);
      if (result.questions.length && attempt >= 3) throw new Error("Question rounds exhausted");
      status = result.questions.length ? "waiting_input" : "ready";
      if (status === "ready" && !result.proposals.length && !result.interview.length) throw new Error("No deliverable");
    } catch {
      status = "failed"; failureCode = "invalid_result"; error = "候选未通过来源或结构检查，请创建新任务；本次不扣点"; result = null;
    }
  }
  const previous = await db.prepare("SELECT COALESCE(SUM(cost_micros),0) cost,COALESCE(SUM(model_calls),0) calls FROM agent_job_runs WHERE job_id=? AND id<>?")
    .bind(id, leaseToken).first<{ cost: number; calls: number }>();
  if (usage.costMicros + Number(previous?.cost ?? 0) > row.budget_micros
    || usage.modelCalls + Number(previous?.calls ?? 0) > row.max_model_calls
    || (status === "waiting_input" && (usage.costMicros + Number(previous?.cost ?? 0) >= row.budget_micros
      || usage.modelCalls + Number(previous?.calls ?? 0) >= row.max_model_calls))) {
    status = "failed"; result = null; failureCode = "budget_exhausted";
    error = "本次任务已达到试点预算，未扣除简迹点";
  }
  // Late/cancelled callbacks may settle operational usage, but cannot revive a task.
  const writes = await db.batch([
    db.prepare(`UPDATE agent_job_runs SET state=CASE
        WHEN (SELECT status FROM agent_jobs WHERE id=?)='cancelled' THEN 'cancelled' ELSE ? END,
      input_tokens=?,cached_input_tokens=?,output_tokens=?,cost_micros=?,model_calls=?,failure_code=?,settled_at=?,price_version=?,cost_basis=?
      WHERE id=? AND job_id=? AND state='running'`)
      .bind(id, failureCode ? "failed" : "succeeded", usage.inputTokens, usage.cachedInputTokens,
        usage.outputTokens, usage.costMicros, usage.modelCalls, failureCode ?? null, now,
        usage.priceVersion ?? null, usage.costBasis ?? "unknown", leaseToken, id),
    db.prepare(`UPDATE agent_jobs SET status=?,version=version+1,result_json=?,error=?,stage=?,updated_at=?
      WHERE id=? AND lease_token=? AND attempt=? AND status='running' AND lease_expires_at>? AND expires_at>?
        AND EXISTS(SELECT 1 FROM users WHERE id=agent_jobs.user_id AND banned=0)
        AND EXISTS(SELECT 1 FROM resumes WHERE id=agent_jobs.resume_id AND deleted_at IS NULL)`)
      .bind(status, result ? JSON.stringify(result) : null, error,
        status === "waiting_input" ? "请补充关键事实" : status === "ready" ? "材料待你复核" : "任务未完成",
        now, id, leaseToken, attempt, now, now),
  ]);
  return { accepted: Number(writes[0]?.meta.changes ?? 0) > 0 };
}
