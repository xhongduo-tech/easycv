import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import {
  ensureDatabase,
  getDatabase,
  getExistingSession,
  getRequestNetworkHash,
  withSessionCookie,
} from "@/../db";
import { createAdvice } from "@/lib/advisor";
import { apiError, parseRequest, rejectCrossOrigin, withApiError } from "@/lib/api";
import { mapResume, mapTarget, mapTargetBrief, type ResumeRow, type TargetBriefRow, type TargetRow } from "@/lib/db-mappers";
import { analyzeJobFit } from "@/lib/job-fit";
import {
  createDeepSeekAdvice,
  getDeepSeekAdvisorConfig,
  shouldResetDeepSeekCircuit,
  shouldTripDeepSeekCircuit,
} from "@/lib/deepseek-advisor";
import { sameSourceRef, type RewriteFocus } from "@/lib/rewrite-proposals";
import { recommendationRequestSchema } from "@/lib/validation";

const MAX_MODEL_INPUT_BYTES = 60_000;
const MODEL_CONCURRENCY = 4;
const MODEL_CONSENT_VERSION = "resume-model-processing-deepseek-v1";

type ModelFallbackReason = "input-too-large" | "rate-limit" | "concurrency" | "provider-error";

export async function GET() {
  const modelConfig = getDeepSeekAdvisorConfig(env);
  return NextResponse.json(
    {
      modelAvailable: Boolean(modelConfig),
      modelProvider: modelConfig ? "deepseek" : null,
      modelSupportsImages: modelConfig?.model === "deepseek-v4-flash-vision-exp",
    },
    { headers: { "cache-control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  try {
    const originError = rejectCrossOrigin(request);
    if (originError) return originError;

    // Reject malformed or oversized bodies before any session/database write.
    const parsed = await parseRequest(request, recommendationRequestSchema);
    if (!parsed.ok) return parsed.response;

    await ensureDatabase();
    const session = await getExistingSession(request);
    if (!session) return apiError(401, "UNAUTHORIZED", "请先创建或打开一份属于你的简历");

    const db = getDatabase();
    const row = await db
      .prepare("SELECT * FROM resumes WHERE id = ? AND user_id = ? AND deleted_at IS NULL")
      .bind(parsed.data.resumeId, session.userId)
      .first<ResumeRow>();
    if (!row) return withSessionCookie(apiError(404, "NOT_FOUND", "没有找到这份简历"), session);

    const resume = mapResume(row);
    const content = parsed.data.content ?? resume.content;
    const track = resume.track;
    const targetProfileId = parsed.data.targetProfileId ?? parsed.data.targetId ?? resume.targetProfileId;
    const targetName = parsed.data.targetName ?? resume.targetName;
    const section = parsed.data.section ?? "overview";
    const targetRow = targetProfileId
      ? await db
          .prepare("SELECT * FROM target_profiles WHERE id = ? AND track = ? AND active = 1")
          .bind(targetProfileId, track)
          .first<TargetRow>()
      : null;
    if (targetProfileId && !targetRow) {
      return withSessionCookie(apiError(404, "NOT_FOUND", "未找到与赛道匹配的目标画像"), session);
    }

    const target = targetRow ? mapTarget(targetRow) : undefined;
    const targetBriefRow = await db
      .prepare("SELECT * FROM resume_target_briefs WHERE resume_id = ? AND user_id = ?")
      .bind(resume.id, session.userId)
      .first<TargetBriefRow>();
    const targetBrief = targetBriefRow ? mapTargetBrief(targetBriefRow) : undefined;
    let rewriteFocus: RewriteFocus | undefined;
    if (parsed.data.requirementId && parsed.data.sourceRef) {
      if (!targetBrief?.requirementsText) {
        return withSessionCookie(apiError(400, "VALIDATION_ERROR", "请先保存目标岗位要求，再针对具体证据生成改写"), session);
      }
      const requirement = analyzeJobFit(content, targetBrief).items.find((item) => item.id === parsed.data.requirementId);
      const evidenceMatches = requirement?.evidence.some((evidence) => (
        evidence.sourceRef && sameSourceRef(evidence.sourceRef, parsed.data.sourceRef!)
      ));
      if (!requirement || !evidenceMatches) {
        return withSessionCookie(apiError(400, "VALIDATION_ERROR", "所选原文已不再对应这条岗位要求，请重新查看证据地图"), session);
      }
      rewriteFocus = { requirementId: requirement.id, sourceRef: parsed.data.sourceRef };
    }
    const networkHash = await getRequestNetworkHash(request);
    if (!await reserveAdviceQuota(db, session.userId, networkHash)) {
      return withSessionCookie(apiError(429, "RATE_LIMITED", "建议请求过于频繁，请稍后再试"), session);
    }

    const modelConfig = getDeepSeekAdvisorConfig(env);
    let provider = "local-rules";
    let modelFallback = false;
    let fallbackReason: ModelFallbackReason | undefined;
    let result = createAdvice(content, track, target, section, targetBrief, rewriteFocus);

    if (parsed.data.allowExternalModel && modelConfig) {
      const providerKey = `deepseek:${modelConfig.model}`;
      const modelInputBytes = new TextEncoder().encode(JSON.stringify({
        content,
        targetBrief: targetBrief ? {
          focusName: targetBrief.focusName,
          requirementsText: targetBrief.requirementsText,
        } : undefined,
      })).byteLength;
      if (modelInputBytes > MAX_MODEL_INPUT_BYTES) {
        modelFallback = true;
        fallbackReason = "input-too-large";
      } else if (await isProviderCircuitOpen(db, providerKey)) {
        modelFallback = true;
        fallbackReason = "provider-error";
      } else {
        const lease = await acquireModelLease(db, session.userId);
        if (!lease) {
          modelFallback = true;
          fallbackReason = "concurrency";
        } else {
          try {
            const usageEventId = await reserveModelQuota(db, session.userId, networkHash);
            if (!usageEventId) {
              modelFallback = true;
              fallbackReason = "rate-limit";
            } else {
              const consentRecorded = await recordModelConsent(
                db,
                session.userId,
                resume.id,
                providerKey,
                section,
              ).then(() => true).catch(() => false);
              if (!consentRecorded) {
                await db.prepare("DELETE FROM model_usage_events WHERE id = ?")
                  .bind(usageEventId)
                  .run()
                  .catch(() => undefined);
                modelFallback = true;
                fallbackReason = "provider-error";
              } else {
                try {
                  result = await createDeepSeekAdvice({
                    content,
                    track,
                    targetName: target?.name ?? targetName ?? (track === "study" ? "目标院校" : "目标企业"),
                    target,
                    targetBrief,
                    section,
                    rewriteFocus,
                    signal: request.signal,
                  }, modelConfig);
                  provider = providerKey;
                  await resetProviderCircuit(db, providerKey).catch(() => undefined);
                } catch (error) {
                  modelFallback = true;
                  fallbackReason = "provider-error";
                  if (!request.signal.aborted && shouldTripDeepSeekCircuit(error)) {
                    await recordProviderFailure(db, providerKey).catch(() => undefined);
                  } else if (shouldResetDeepSeekCircuit(error)) {
                    await resetProviderCircuit(db, providerKey).catch(() => undefined);
                  }
                }
              }
            }
          } finally {
            await releaseModelLease(db, lease).catch(() => undefined);
          }
        }
      }
    }

    // Local-rule calls are deliberately not logged row-by-row; model successes are bounded to 100/day.
    if (provider !== "local-rules") {
      await db
        .prepare(`INSERT INTO suggestion_events
          (id, resume_id, target_profile_id, section, score, provider, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          crypto.randomUUID(),
          resume.id,
          targetProfileId ?? null,
          section,
          result.score,
          provider,
          new Date().toISOString(),
        )
        .run();
    }

    return withSessionCookie(NextResponse.json({
      ...result,
      provider,
      modelAvailable: Boolean(modelConfig),
      modelFallback,
      fallbackReason,
      baseResumeRevision: resume.revision,
      baseBriefRevision: targetBrief?.revision ?? 0,
      factPolicy: "建议不会自动改写；所有事实和数字都需由你核实",
    }), session);
  } catch (error) {
    return withApiError(error);
  }
}

async function reserveAdviceQuota(
  db: ReturnType<typeof getDatabase>,
  userId: string,
  networkHash: string | null,
) {
  const window = usageWindow();
  await db.prepare("DELETE FROM advice_usage_events WHERE created_at < ?")
    .bind(window.cleanupBefore)
    .run()
    .catch(() => undefined);
  const reserved = await db.prepare(`INSERT INTO advice_usage_events (id, user_id, network_hash, created_at)
    SELECT ?, ?, ?, ?
    WHERE (SELECT COUNT(*) FROM advice_usage_events WHERE user_id = ? AND created_at >= ?) < 30
      AND (SELECT COUNT(*) FROM advice_usage_events WHERE user_id = ? AND created_at >= ?) < 90
      AND (? IS NULL OR (SELECT COUNT(*) FROM advice_usage_events WHERE network_hash = ? AND created_at >= ?) < 100)
      AND (? IS NULL OR (SELECT COUNT(*) FROM advice_usage_events WHERE network_hash = ? AND created_at >= ?) < 300)
      AND (SELECT COUNT(*) FROM advice_usage_events WHERE created_at >= ?) < 5000
    RETURNING id`)
    .bind(
      crypto.randomUUID(), userId, networkHash, window.now,
      userId, window.hourStart,
      userId, window.dayStart,
      networkHash, networkHash, window.hourStart,
      networkHash, networkHash, window.dayStart,
      window.dayStart,
    )
    .first<{ id: string }>();
  return Boolean(reserved);
}

async function reserveModelQuota(
  db: ReturnType<typeof getDatabase>,
  userId: string,
  networkHash: string | null,
) {
  const window = usageWindow();
  await db.prepare("DELETE FROM model_usage_events WHERE created_at < ?")
    .bind(window.cleanupBefore)
    .run()
    .catch(() => undefined);
  const id = crypto.randomUUID();
  const reserved = await db.prepare(`INSERT INTO model_usage_events (id, user_id, network_hash, created_at)
    SELECT ?, ?, ?, ?
    WHERE (SELECT COUNT(*) FROM model_usage_events WHERE user_id = ? AND created_at >= ?) < 10
      AND (SELECT COUNT(*) FROM model_usage_events WHERE user_id = ? AND created_at >= ?) < 30
      AND (? IS NULL OR (SELECT COUNT(*) FROM model_usage_events WHERE network_hash = ? AND created_at >= ?) < 30)
      AND (? IS NULL OR (SELECT COUNT(*) FROM model_usage_events WHERE network_hash = ? AND created_at >= ?) < 60)
      AND (SELECT COUNT(*) FROM model_usage_events WHERE created_at >= ?) < 100
    RETURNING id`)
    .bind(
      id, userId, networkHash, window.now,
      userId, window.hourStart,
      userId, window.dayStart,
      networkHash, networkHash, window.hourStart,
      networkHash, networkHash, window.dayStart,
      window.dayStart,
    )
    .first<{ id: string }>();
  return reserved?.id ?? null;
}

async function acquireModelLease(db: ReturnType<typeof getDatabase>, ownerKey: string) {
  const requestId = crypto.randomUUID();
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + 35_000).toISOString();
  const sessionLease = await db.prepare(`INSERT INTO model_session_leases (owner_key, request_id, expires_at)
    VALUES (?, ?, ?)
    ON CONFLICT(owner_key) DO UPDATE SET request_id = excluded.request_id, expires_at = excluded.expires_at
    WHERE model_session_leases.expires_at < ?
    RETURNING owner_key`)
    .bind(ownerKey, requestId, expiresAt, nowIso)
    .first<{ owner_key: string }>();
  if (!sessionLease) return null;

  for (let slot = 1; slot <= MODEL_CONCURRENCY; slot += 1) {
    const reserved = await db.prepare(`INSERT INTO model_request_leases (slot, request_id, expires_at)
      VALUES (?, ?, ?)
      ON CONFLICT(slot) DO UPDATE SET request_id = excluded.request_id, expires_at = excluded.expires_at
      WHERE model_request_leases.expires_at < ?
      RETURNING slot`)
      .bind(slot, requestId, expiresAt, nowIso)
      .first<{ slot: number }>();
    if (reserved) return { slot: reserved.slot, requestId, ownerKey };
  }

  await db.prepare("DELETE FROM model_session_leases WHERE owner_key = ? AND request_id = ?")
    .bind(ownerKey, requestId)
    .run();
  return null;
}

async function releaseModelLease(
  db: ReturnType<typeof getDatabase>,
  lease: { slot: number; requestId: string; ownerKey: string },
) {
  await db.batch([
    db.prepare("DELETE FROM model_request_leases WHERE slot = ? AND request_id = ?")
      .bind(lease.slot, lease.requestId),
    db.prepare("DELETE FROM model_session_leases WHERE owner_key = ? AND request_id = ?")
      .bind(lease.ownerKey, lease.requestId),
  ]);
}

async function recordModelConsent(
  db: ReturnType<typeof getDatabase>,
  userId: string,
  resumeId: string,
  provider: string,
  section: string,
) {
  await db.prepare(`INSERT INTO model_consent_events
    (id, user_id, resume_id, provider, purpose, consent_version, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      crypto.randomUUID(),
      userId,
      resumeId,
      provider,
      `resume-${section}-advice`,
      MODEL_CONSENT_VERSION,
      new Date().toISOString(),
    )
    .run();
}

async function isProviderCircuitOpen(db: ReturnType<typeof getDatabase>, providerKey: string) {
  const state = await db.prepare("SELECT open_until FROM model_provider_state WHERE provider_key = ?")
    .bind(providerKey)
    .first<{ open_until: string | null }>();
  return Boolean(state?.open_until && state.open_until > new Date().toISOString());
}

async function recordProviderFailure(db: ReturnType<typeof getDatabase>, providerKey: string) {
  const now = new Date();
  const openUntil = new Date(now.getTime() + 600_000).toISOString();
  await db.prepare(`INSERT INTO model_provider_state
    (provider_key, consecutive_failures, open_until, updated_at)
    VALUES (?, 1, NULL, ?)
    ON CONFLICT(provider_key) DO UPDATE SET
      consecutive_failures = model_provider_state.consecutive_failures + 1,
      open_until = CASE
        WHEN model_provider_state.consecutive_failures + 1 >= 3 THEN ?
        ELSE model_provider_state.open_until
      END,
      updated_at = excluded.updated_at`)
    .bind(providerKey, now.toISOString(), openUntil)
    .run();
}

async function resetProviderCircuit(db: ReturnType<typeof getDatabase>, providerKey: string) {
  await db.prepare("DELETE FROM model_provider_state WHERE provider_key = ?").bind(providerKey).run();
}

function usageWindow() {
  const now = new Date();
  return {
    now: now.toISOString(),
    hourStart: new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000).toISOString(),
    dayStart: new Date(Math.floor(now.getTime() / 86_400_000) * 86_400_000).toISOString(),
    cleanupBefore: new Date(now.getTime() - 172_800_000).toISOString(),
  };
}
