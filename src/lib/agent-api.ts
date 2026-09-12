import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureDatabase, getDatabase, getExistingSession } from "@/../db";
import { apiError, parseRequest, rejectCrossOrigin, withApiError } from "./api";
import { codexRuntimeConfig, publicAgentRuntime } from "./agent-runtime";
import {
  AgentJobError, agentUsageSchema, answerAgentJob, applyAgentJob, cancelAgentJob, claimAgentJob,
  createAgentJob, finishAgentJob, heartbeatAgentJob, mapAgentJob, ownedAgentJob, type AgentJobRow,
} from "./agent-jobs";
import { hasValidMaintenanceCredential } from "./maintenance-auth";

const identifier = z.string().uuid();
const version = z.number().int().positive();
const createSchema = z.object({ resumeId: identifier, expectedRevision: version,
  expectedBriefRevision: z.number().int().min(0), requestId: identifier, consent: z.literal(true) }).strict();
const actionSchemas = {
  answers: z.object({ expectedVersion: version, answers: z.array(z.object({
    questionId: z.string().min(1).max(100), text: z.string().trim().min(1).max(2000),
  }).strict()).min(1).max(3) }).strict(),
  cancel: z.object({ expectedVersion: version }).strict(),
  apply: z.object({ expectedVersion: version, expectedRevision: version, expectedBriefRevision: z.number().int().min(0),
    proposalIds: z.array(z.string().min(1).max(100)).min(1).max(8), confirmed: z.literal(true) }).strict(),
};
const leaseSchema = z.object({ leaseToken: identifier, attempt: z.number().int().min(1).max(3) });
const completeSchema = leaseSchema.extend({ result: z.unknown(), usage: agentUsageSchema }).strict();
const failSchema = leaseSchema.extend({ code: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/), usage: agentUsageSchema }).strict();
const heartbeatSchema = leaseSchema.extend({ stage: z.string().max(120).optional() }).strict();

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}
function handleError(error: unknown) {
  if (error instanceof AgentJobError) return apiError(error.status, error.code, error.message);
  if (error instanceof z.ZodError) return apiError(422, "VALIDATION_ERROR", "材料结构或事实引用不符合要求，请检查后重试");
  return withApiError(error);
}
async function runtime() {
  const config = codexRuntimeConfig(env as unknown as Record<string, unknown>);
  const state = await getDatabase().prepare("SELECT last_seen_at FROM agent_runtime_state WHERE id='codex' AND model=?")
    .bind(config.model).first<{ last_seen_at: string }>();
  return { config, public: publicAgentRuntime(config, state?.last_seen_at ?? null) };
}

export async function agentJobsEndpoint(request: Request) {
  try {
    if (request.method === "POST") { const origin = rejectCrossOrigin(request); if (origin) return origin; }
    await ensureDatabase();
    const session = await getExistingSession(request);
    if (!session) return apiError(401, "UNAUTHORIZED", "请先登录或打开你的简历工作台");
    const db = getDatabase();
    if (request.method === "GET") {
      const id = identifier.safeParse(new URL(request.url).searchParams.get("resumeId"));
      if (!id.success) return apiError(422, "VALIDATION_ERROR", "简历 ID 无效");
      const owned = await db.prepare("SELECT id FROM resumes WHERE id=? AND user_id=? AND deleted_at IS NULL")
        .bind(id.data, session.userId).first();
      if (!owned) return apiError(404, "NOT_FOUND", "没有找到这份简历");
      const jobs = await db.prepare("SELECT * FROM agent_jobs WHERE resume_id=? AND user_id=? AND expires_at>? ORDER BY created_at DESC LIMIT 20")
        .bind(id.data, session.userId, new Date().toISOString()).all<AgentJobRow>();
      const availability = (await runtime()).public;
      return json({ jobs: jobs.results.map(mapAgentJob), runtime: session.kind === "user" ? availability
        : { ...availability, enabled: false, reason: "登录正式账号后即可使用 Codex 材料任务" } });
    }
    const parsed = await parseRequest(request, createSchema);
    if (!parsed.ok) return parsed.response;
    if (session.kind !== "user") return apiError(403, "FORBIDDEN", "请先登录正式账号，再创建 Codex 材料任务");
    const availability = await runtime();
    if (!availability.public.enabled) return apiError(503, "SERVICE_DISABLED", availability.public.reason ?? "任务服务暂不可用");
    const job = await createAgentJob(db, session.userId, availability.config, parsed.data);
    return json({ job }, 202);
  } catch (error) { return handleError(error); }
}

export async function agentJobEndpoint(request: Request, id: string, action?: string) {
  try {
    if (!identifier.safeParse(id).success) return apiError(422, "VALIDATION_ERROR", "任务 ID 无效");
    if (request.method === "POST") { const origin = rejectCrossOrigin(request); if (origin) return origin; }
    await ensureDatabase();
    const session = await getExistingSession(request);
    if (!session) return apiError(401, "UNAUTHORIZED", "请先登录");
    const db = getDatabase();
    if (request.method === "GET") {
      const job = await ownedAgentJob(db, id, session.userId);
      if (Date.parse(job.expires_at) <= Date.now()) return apiError(410, "IDEMPOTENCY_EXPIRED", "任务材料已到期");
      return json({ job: mapAgentJob(job) });
    }
    if (action === "answers") {
      const parsed = await parseRequest(request, actionSchemas.answers);
      if (!parsed.ok) return parsed.response;
      const availability = await runtime();
      if (!availability.public.enabled) return apiError(503, "SERVICE_DISABLED", availability.public.reason ?? "任务服务暂不可用");
      return json({ job: await answerAgentJob(db, id, session.userId, parsed.data.expectedVersion, parsed.data.answers) });
    }
    if (action === "cancel") {
      const parsed = await parseRequest(request, actionSchemas.cancel);
      if (!parsed.ok) return parsed.response;
      return json({ job: await cancelAgentJob(db, id, session.userId, parsed.data.expectedVersion) });
    }
    if (action === "apply") {
      const parsed = await parseRequest(request, actionSchemas.apply);
      if (!parsed.ok) return parsed.response;
      return json(await applyAgentJob(db, id, session.userId, parsed.data));
    }
    return apiError(404, "NOT_FOUND", "没有这项任务操作");
  } catch (error) { return handleError(error); }
}

export async function internalAgentEndpoint(request: Request, action: string, id?: string) {
  try {
    const config = codexRuntimeConfig(env as unknown as Record<string, unknown>);
    if (!(await hasValidMaintenanceCredential(request, config.secret))) return apiError(401, "UNAUTHORIZED", "执行服务凭据无效");
    if (request.headers.get("origin")) return apiError(403, "FORBIDDEN", "此接口只供受控执行服务使用");
    await ensureDatabase();
    const db = getDatabase();
    if (action === "claim" && !id) {
      if (!config.enabled) return json({ job: null });
      const parsed = await parseRequest(request, z.object({ workerId: z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/),
        model: z.string().min(1).max(100) }).strict());
      if (!parsed.ok) return parsed.response;
      if (parsed.data.model !== config.model) return apiError(422, "VALIDATION_ERROR", "执行服务模型配置不一致");
      return json({ job: await claimAgentJob(db, config, parsed.data.workerId) });
    }
    if (!id || !identifier.safeParse(id).success) return apiError(422, "VALIDATION_ERROR", "任务 ID 无效");
    if (action === "heartbeat") {
      const parsed = await parseRequest(request, heartbeatSchema);
      if (!parsed.ok) return parsed.response;
      return json({ continue: config.enabled && await heartbeatAgentJob(db, id, parsed.data.leaseToken,
        parsed.data.attempt, "正在分析证据与准备材料") });
    }
    if (action === "complete") {
      const parsed = await parseRequest(request, completeSchema);
      if (!parsed.ok) return parsed.response;
      return json(await finishAgentJob(db, id, parsed.data.leaseToken, parsed.data.attempt,
        parsed.data.usage, parsed.data.result, config.enabled ? undefined : "service_disabled"));
    }
    if (action === "fail") {
      const parsed = await parseRequest(request, failSchema);
      if (!parsed.ok) return parsed.response;
      return json(await finishAgentJob(db, id, parsed.data.leaseToken, parsed.data.attempt,
        parsed.data.usage, null, parsed.data.code));
    }
    return apiError(404, "NOT_FOUND", "没有这项执行操作");
  } catch (error) { return handleError(error); }
}
