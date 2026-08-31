import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import {
  ensureDatabase,
  getDatabase,
  getExistingSession,
  getRequestNetworkHash,
  type GuestSession,
  withSessionCookie,
} from "@/../db";
import { createAdvice } from "@/lib/advisor";
import {
  canCompleteAbandonedAdviceDelivery,
  mergeAdviceDeliveryState,
  type AdviceAccessState,
} from "@/lib/advice-delivery";
import { apiError, parseRequest, rejectCrossOrigin, withApiError } from "@/lib/api";
import { mapResume, mapTarget, mapTargetBrief, type ResumeRow, type TargetBriefRow, type TargetRow } from "@/lib/db-mappers";
import { analyzeJobFit } from "@/lib/job-fit";
import {
  createDeepSeekAdvice,
  DEEPSEEK_MAX_OUTPUT_TOKENS,
  DeepSeekAdvisorError,
  getDeepSeekDailyBudgetMicros,
  getDeepSeekAdvisorConfig,
  isDeepSeekAdviceRequestWithinInputBudget,
  prepareDeepSeekAdviceRequest,
  shouldResetDeepSeekCircuit,
  shouldTripDeepSeekCircuit,
} from "@/lib/deepseek-advisor";
import {
  AiCreditSettlementUncertainError,
  ensureSignupCredits,
  getCreditBalance,
  getGuestTrialBalance,
  getSignupPromoIdentityHashes,
  releaseAiCredit,
  reserveAiCredit,
  settleAiCreditForModelRun,
  settleFailedAiCreditForModelRun,
  type CreditReservation,
  type ModelAdviceDelivery,
} from "@/lib/credits";
import { isOneCreditDeepSeekModel, type ModelTokenUsage } from "@/lib/pricing";
import { reserveModelRunBudget } from "@/lib/model-budget";
import {
  expireExistingModelAttempt,
  hasAbandonedModelAttempt,
  ModelAttemptOwnerConflictError,
  recoverAbandonedModelAttempt,
} from "@/lib/model-attempt-recovery";
import { sameSourceRef, type RewriteFocus } from "@/lib/rewrite-proposals";
import { acquireOwnerLease, releaseOwnerLease, renewOwnerLease } from "@/lib/owner-lease";
import { recommendationRequestSchema } from "@/lib/validation";

const MAX_MODEL_INPUT_BYTES = 32_000;
const MODEL_CONCURRENCY = 4;
const MODEL_GLOBAL_HOURLY_LIMIT = 400;
const MODEL_GLOBAL_DAILY_LIMIT = 2_000;
const MODEL_CONSENT_VERSION = "resume-model-processing-deepseek-v1";
const MODEL_DELIVERY_TTL_MS = 15 * 60 * 1000;
const MODEL_ATTEMPT_RECOVERY_MS = 2 * 60 * 1000;
const RECOMMENDATION_OWNER_LEASE_TTL_MS = 90_000;

type ModelFallbackReason =
  | "input-too-large"
  | "rate-limit"
  | "concurrency"
  | "provider-error"
  | "no-credits"
  | "login-required";

class ModelBudgetExceededError extends Error {
  constructor() {
    super("Daily model budget exhausted");
    this.name = "ModelBudgetExceededError";
  }
}

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    const configuredModel = getDeepSeekAdvisorConfig(env);
    const modelConfig = configuredModel && isOneCreditDeepSeekModel(configuredModel.model)
      ? configuredModel
      : null;
    const db = getDatabase();
    const session = await getExistingSession(request);
    const access = session
      ? await getAiAccessState(db, session)
      : { creditBalance: 0, bonusCredits: 0, purchasedCredits: 0, accountKind: "none" as const };
    return NextResponse.json(
      {
        modelAvailable: await isCurrentModelAvailable(db),
        modelProvider: modelConfig ? "deepseek" : null,
        modelSupportsImages: modelConfig?.model === "deepseek-v4-flash-vision-exp",
        ...access,
      },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return withApiError(error);
  }
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
    const ownerAttempt = await acquireOwnerLease(
      db,
      session.userId,
      parsed.data.requestId,
      RECOMMENDATION_OWNER_LEASE_TTL_MS,
    );
    if (!ownerAttempt.lease) {
      const response = apiError(
        409,
        "IDEMPOTENCY_IN_PROGRESS",
        ownerAttempt.blockingOperationId === parsed.data.requestId
          ? "同一次建议请求仍在处理中，请稍后重试"
          : "当前账号数据正在处理中，请稍后重试",
      );
      response.headers.set("retry-after", "2");
      return withSessionCookie(response, session);
    }

    try {
    const row = await db
      .prepare("SELECT * FROM resumes WHERE id = ? AND user_id = ? AND deleted_at IS NULL")
      .bind(parsed.data.resumeId, session.userId)
      .first<ResumeRow>();
    if (!row) return withSessionCookie(apiError(404, "NOT_FOUND", "没有找到这份简历"), session);

    const requestFingerprint = await recommendationRequestFingerprint(parsed.data);
    const priorDelivery = await db.prepare(`SELECT user_id, resume_id, request_fingerprint,
        response_json, attempt_state, created_at, updated_at, expires_at
      FROM model_advice_deliveries WHERE request_id = ?`)
      .bind(parsed.data.requestId)
      .first<{
        user_id: string;
        resume_id: string;
        request_fingerprint: string;
        response_json: string;
        attempt_state: string;
        created_at: string;
        updated_at: string;
        expires_at: string;
      }>();
    let recoveringPendingDelivery = false;
    if (priorDelivery) {
      if (priorDelivery.user_id !== session.userId) {
        return withSessionCookie(apiError(409, "IDEMPOTENCY_CONFLICT", "请求标识已用于其他内容，请重新发起"), session);
      }
      if (
        priorDelivery.resume_id !== parsed.data.resumeId
        || priorDelivery.request_fingerprint !== requestFingerprint
      ) {
        return withSessionCookie(apiError(409, "IDEMPOTENCY_CONFLICT", "请求标识已用于其他内容，请重新发起"), session);
      }
      const pending = new Set(["prepared", "provider_started", "settlement_pending"])
        .has(priorDelivery.attempt_state);
      if (pending) {
        const lastTransitionAt = new Date(priorDelivery.updated_at || priorDelivery.created_at).getTime();
        if (Number.isFinite(lastTransitionAt) && Date.now() - lastTransitionAt < MODEL_ATTEMPT_RECOVERY_MS) {
          const response = apiError(503, "SETTLEMENT_PENDING", "增强请求正在处理或核对中，请使用同一请求稍后重试");
          response.headers.set("retry-after", "2");
          return withSessionCookie(response, session);
        }
        recoveringPendingDelivery = true;
      } else if (new Set(["succeeded", "fallback"]).has(priorDelivery.attempt_state)) {
        if (priorDelivery.expires_at <= new Date().toISOString()) {
          await db.prepare(`UPDATE model_advice_deliveries
            SET response_json = '{}', attempt_state = 'expired', updated_at = ? WHERE request_id = ?`)
            .bind(new Date().toISOString(), parsed.data.requestId)
            .run();
          return withSessionCookie(apiError(409, "IDEMPOTENCY_EXPIRED", "原增强结果已超过重放期限，请重新发起"), session);
        }
        const replayAccess = await getAiAccessState(db, session);
        const replayModelAvailable = await isCurrentModelAvailable(db);
        return withSessionCookie(
          NextResponse.json(mergeAdviceDeliveryState(
            priorDelivery.response_json,
            replayAccess,
            replayModelAvailable,
          )),
          session,
        );
      } else if (canCompleteAbandonedAdviceDelivery(
        priorDelivery.attempt_state,
        priorDelivery.response_json,
        priorDelivery.expires_at,
      )) {
        // The no-charge recovery can commit immediately before a worker dies.
        // Finish the same fallback on retry instead of abandoning its key.
        recoveringPendingDelivery = true;
      } else {
        return withSessionCookie(apiError(409, "IDEMPOTENCY_EXPIRED", "原增强请求已结束且结果不可重放，请重新发起"), session);
      }
    }

    if (!priorDelivery) {
      try {
        if (await hasAbandonedModelAttempt(db, parsed.data.requestId, session.userId)) {
          await expireExistingModelAttempt(db, parsed.data.requestId, session.userId);
          return withSessionCookie(apiError(
            409,
            "IDEMPOTENCY_EXPIRED",
            "原增强请求已结束且结果不可重放，请重新发起",
          ), session);
        }
      } catch (error) {
        if (error instanceof ModelAttemptOwnerConflictError) {
          return withSessionCookie(apiError(
            409,
            "IDEMPOTENCY_CONFLICT",
            "请求标识已用于其他账号，请重新发起",
          ), session);
        }
        throw error;
      }
    }

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
    if (!recoveringPendingDelivery && !await reserveAdviceQuota(db, session.userId, networkHash)) {
      return withSessionCookie(apiError(429, "RATE_LIMITED", "建议请求过于频繁，请稍后再试"), session);
    }

    const configuredModel = getDeepSeekAdvisorConfig(env);
    const modelConfig = configuredModel && isOneCreditDeepSeekModel(configuredModel.model)
      ? configuredModel
      : null;
    let provider = "local-rules";
    let modelFallback = false;
    let fallbackReason: ModelFallbackReason | undefined;
    let creditCharged = 0;
    let shouldPersistTerminalDelivery = false;
    let failedCreditSettlement: {
      reservation: CreditReservation;
      model: string;
      failureKind: string;
      usage?: ModelTokenUsage;
    } | null = null;
    let settledResponseJson: string | null = null;
    let result = createAdvice(content, track, target, section, targetBrief, rewriteFocus);
    if (recoveringPendingDelivery) {
      await recoverAbandonedModelAttempt(db, parsed.data.requestId, session.userId);
      shouldPersistTerminalDelivery = true;
      modelFallback = true;
      fallbackReason = "provider-error";
    }
    let access: AdviceAccessState = await getAiAccessState(db, session);

    if (!recoveringPendingDelivery && parsed.data.allowExternalModel && modelConfig) {
      const providerKey = `deepseek:${modelConfig.model}`;
      const modelInputBytes = new TextEncoder().encode(JSON.stringify({
        content,
        targetBrief: targetBrief ? {
          focusName: targetBrief.focusName,
          requirementsText: targetBrief.requirementsText,
        } : undefined,
      })).byteLength;
      const advisorInput = {
        content,
        track,
        targetName: target?.name ?? targetName ?? (track === "study" ? "目标院校" : "目标企业"),
        target,
        targetBrief,
        section,
        rewriteFocus,
        signal: request.signal,
      };
      const preparedModelRequest = modelInputBytes <= MAX_MODEL_INPUT_BYTES
        ? prepareDeepSeekAdviceRequest(advisorInput, modelConfig)
        : null;
      if (access.creditBalance < 1) {
        modelFallback = true;
        fallbackReason = session.kind === "guest" ? "login-required" : "no-credits";
      } else if (modelInputBytes > MAX_MODEL_INPUT_BYTES) {
        modelFallback = true;
        fallbackReason = "input-too-large";
      } else if (
        !preparedModelRequest
        || !isDeepSeekAdviceRequestWithinInputBudget(preparedModelRequest)
      ) {
        modelFallback = true;
        fallbackReason = "input-too-large";
      } else if (await isProviderCircuitOpen(db, providerKey)) {
        modelFallback = true;
        fallbackReason = "provider-error";
      } else {
        const modelSlot = await acquireModelSlot(db, parsed.data.requestId);
        if (!modelSlot) {
          modelFallback = true;
          fallbackReason = "concurrency";
        } else {
          try {
            const modelQuota = await reserveModelQuota(
              db,
              session.userId,
              networkHash,
              parsed.data.requestId,
            );
            if (modelQuota.requestIdOwner) {
              return withSessionCookie(apiError(
                409,
                modelQuota.requestIdOwner === session.userId
                  ? "IDEMPOTENCY_IN_PROGRESS"
                  : "IDEMPOTENCY_CONFLICT",
                modelQuota.requestIdOwner === session.userId
                  ? "同一次建议请求仍在处理中，请稍后重试"
                  : "请求标识已用于其他账号，请重新发起",
              ), session);
            }
            const usageEventId = modelQuota.usageEventId;
            if (!usageEventId) {
              modelFallback = true;
              fallbackReason = "rate-limit";
            } else {
              let creditReservation: CreditReservation | null = null;
              creditReservation = await reserveAiCredit(
                db,
                session.userId,
                usageEventId,
                modelConfig.model,
              );
              if (!creditReservation) {
                await db.prepare("DELETE FROM model_usage_events WHERE id = ?")
                  .bind(usageEventId)
                  .run()
                  .catch(() => undefined);
                modelFallback = true;
                fallbackReason = session.kind === "guest" ? "login-required" : "no-credits";
              } else {
                const pendingCreatedAt = new Date();
                try {
                  await createPendingAdviceDelivery(db, parsed.data.requestId, {
                    userId: session.userId,
                    resumeId: resume.id,
                    requestFingerprint,
                    responseJson: "__pending__",
                    providerKey,
                    createdAt: pendingCreatedAt.toISOString(),
                    expiresAt: new Date(pendingCreatedAt.getTime() + MODEL_DELIVERY_TTL_MS).toISOString(),
                  });
                  shouldPersistTerminalDelivery = true;
                } catch (error) {
                  // No provider call can start without its replay marker. Undo
                  // the reservation before surfacing the idempotency/storage
                  // error so this pre-provider failure never costs a credit.
                  await releaseAiCredit(db, creditReservation, "delivery-create-failed");
                  await db.prepare("DELETE FROM model_usage_events WHERE id = ?")
                    .bind(usageEventId)
                    .run()
                    .catch(() => undefined);
                  throw error;
                }
                const consentRecorded = await recordModelConsent(
                  db,
                  session.userId,
                  resume.id,
                  providerKey,
                  section,
                ).then(() => true).catch(() => false);
                if (!consentRecorded) {
                  failedCreditSettlement = {
                    reservation: creditReservation,
                    model: modelConfig.model,
                    failureKind: "consent-record-failed",
                  };
                  modelFallback = true;
                  fallbackReason = "provider-error";
                } else {
                  let billableUsage: ModelTokenUsage | undefined;
                  try {
                    if (!await renewOwnerLease(
                      db,
                      ownerAttempt.lease,
                      RECOMMENDATION_OWNER_LEASE_TTL_MS,
                    )) throw new ModelBudgetExceededError();
                    if (!await recordModelRunStart(
                      db,
                      usageEventId,
                      session.userId,
                      modelConfig.model,
                      creditReservation?.id ?? null,
                      preparedModelRequest.inputTokenUpperBound,
                      ownerAttempt.lease.leaseId,
                    )) throw new ModelBudgetExceededError();
                    const modelResult = await createDeepSeekAdvice(
                      advisorInput,
                      modelConfig,
                      undefined,
                      preparedModelRequest,
                    );
                    const { modelUsage, ...modelAdvice } = modelResult;
                    billableUsage = modelUsage;
                    const deliveryCreatedAt = new Date();
                    const responsePayload = {
                      ...modelAdvice,
                      provider: providerKey,
                      modelFallback: false,
                      creditCharged: 1,
                      baseResumeRevision: resume.revision,
                      baseBriefRevision: targetBrief?.revision ?? 0,
                      factPolicy: "建议不会自动改写；所有事实和数字都需由你核实",
                    };
                    const responseJson = JSON.stringify(responsePayload);
                    await db.prepare(`UPDATE model_advice_deliveries
                      SET attempt_state = 'settlement_pending', updated_at = ?
                      WHERE request_id = ? AND user_id = ? AND attempt_state = 'provider_started'`)
                      .bind(new Date().toISOString(), parsed.data.requestId, session.userId)
                      .run();
                    if (!await settleAiCreditForModelRun(
                      db,
                      creditReservation,
                      modelConfig.model,
                      modelUsage,
                      {
                        userId: session.userId,
                        resumeId: resume.id,
                        requestFingerprint,
                        responseJson,
                        createdAt: deliveryCreatedAt.toISOString(),
                        expiresAt: new Date(deliveryCreatedAt.getTime() + MODEL_DELIVERY_TTL_MS).toISOString(),
                      },
                    )) {
                      throw new Error("AI credit settlement failed");
                    }
                    settledResponseJson = responseJson;
                    result = modelAdvice;
                    provider = providerKey;
                    creditCharged = 1;
                    await resetProviderCircuit(db, providerKey).catch(() => undefined);
                  } catch (error) {
                    if (error instanceof AiCreditSettlementUncertainError) throw error;
                    failedCreditSettlement = {
                      reservation: creditReservation,
                      model: modelConfig.model,
                      failureKind: modelFailureKind(error),
                      usage: error instanceof DeepSeekAdvisorError ? error.usage : billableUsage,
                    };
                    modelFallback = true;
                    fallbackReason = error instanceof ModelBudgetExceededError
                      ? "rate-limit"
                      : error instanceof DeepSeekAdvisorError && error.kind === "input-too-large"
                        ? "input-too-large"
                        : "provider-error";
                    if (!request.signal.aborted && shouldTripDeepSeekCircuit(error)) {
                      await recordProviderFailure(db, providerKey).catch(() => undefined);
                    } else if (shouldResetDeepSeekCircuit(error)) {
                      await resetProviderCircuit(db, providerKey).catch(() => undefined);
                    }
                  }
                }
              }
            }
          } finally {
            await releaseModelSlot(db, modelSlot).catch(() => undefined);
          }
        }
      }
    }

    // Local-rule calls are deliberately not logged row-by-row. Successful model runs are
    // retained separately for cost and credit reconciliation without storing resume text.
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
        .run()
        .catch(() => undefined);
    }

    if (!settledResponseJson) {
      const deliveryCreatedAt = new Date();
      settledResponseJson = JSON.stringify({
        ...result,
        provider,
        modelFallback,
        fallbackReason,
        creditCharged,
        baseResumeRevision: resume.revision,
        baseBriefRevision: targetBrief?.revision ?? 0,
        factPolicy: "建议不会自动改写；所有事实和数字都需由你核实",
      });
      if (shouldPersistTerminalDelivery) {
        const delivery = {
          userId: session.userId,
          resumeId: resume.id,
          requestFingerprint,
          responseJson: settledResponseJson,
          createdAt: deliveryCreatedAt.toISOString(),
          expiresAt: new Date(deliveryCreatedAt.getTime() + MODEL_DELIVERY_TTL_MS).toISOString(),
        };
        if (failedCreditSettlement) {
          await settleFailedAiCreditForModelRun(
            db,
            failedCreditSettlement.reservation,
            failedCreditSettlement.model,
            failedCreditSettlement.failureKind,
            failedCreditSettlement.usage,
            delivery,
          );
        } else {
          await saveTerminalAdviceDelivery(db, parsed.data.requestId, delivery);
        }
      }
    }

    try {
      access = await getCurrentAiAccessState(db, session);
    } catch (error) {
      throw new AiCreditSettlementUncertainError(error);
    }
    // A successful provider run necessarily passed the circuit check and its
    // success reset. Avoid rereading the same provider row on the hot path.
    const modelAvailable = creditCharged === 1
      ? true
      : await isCurrentModelAvailable(db).catch(() => false);
    return withSessionCookie(
      NextResponse.json(mergeAdviceDeliveryState(settledResponseJson, access, modelAvailable)),
      session,
    );
    } finally {
      await releaseOwnerLease(db, ownerAttempt.lease).catch(() => undefined);
    }
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
  // Retention maintenance removes old rows in a separate invocation. Keeping
  // cleanup out of the latency-sensitive request also preserves D1 Free's
  // per-invocation statement budget.
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
  requestId: string,
) {
  const window = usageWindow();
  const reserved = await db.prepare(`INSERT INTO model_usage_events (id, user_id, network_hash, created_at)
    SELECT ?, ?, ?, ?
    WHERE (SELECT COUNT(*) FROM model_usage_events WHERE user_id = ? AND created_at >= ?) < 20
      AND (SELECT COUNT(*) FROM model_usage_events WHERE user_id = ? AND created_at >= ?) < 100
      AND (? IS NULL OR (SELECT COUNT(*) FROM model_usage_events WHERE network_hash = ? AND created_at >= ?) < 80)
      AND (? IS NULL OR (SELECT COUNT(*) FROM model_usage_events WHERE network_hash = ? AND created_at >= ?) < 240)
      AND (SELECT COUNT(*) FROM model_usage_events WHERE created_at >= ?) < ?
      AND (SELECT COUNT(*) FROM model_usage_events WHERE created_at >= ?) < ?
    ON CONFLICT(id) DO NOTHING
    RETURNING id`)
    .bind(
      requestId, userId, networkHash, window.now,
      userId, window.hourStart,
      userId, window.dayStart,
      networkHash, networkHash, window.hourStart,
      networkHash, networkHash, window.dayStart,
      window.hourStart, MODEL_GLOBAL_HOURLY_LIMIT,
      window.dayStart, MODEL_GLOBAL_DAILY_LIMIT,
    )
    .first<{ id: string }>();
  if (reserved) return { usageEventId: reserved.id, requestIdOwner: null };
  // The conditional INSERT also returns no row for quota denial. Read only on
  // that uncommon branch to distinguish it from a concurrent request-id claim.
  const existing = await db.prepare("SELECT user_id FROM model_usage_events WHERE id = ?")
    .bind(requestId)
    .first<{ user_id: string }>();
  return {
    usageEventId: null,
    requestIdOwner: existing?.user_id ?? null,
  };
}

async function acquireModelSlot(
  db: ReturnType<typeof getDatabase>,
  requestId: string,
) {
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + RECOMMENDATION_OWNER_LEASE_TTL_MS).toISOString();
  const slotLeaseId = `${requestId}::lease::${crypto.randomUUID()}`;

  for (let slot = 1; slot <= MODEL_CONCURRENCY; slot += 1) {
    const reserved = await db.prepare(`INSERT INTO model_request_leases (slot, request_id, expires_at)
      VALUES (?, ?, ?)
      ON CONFLICT(slot) DO UPDATE SET request_id = excluded.request_id, expires_at = excluded.expires_at
      WHERE model_request_leases.expires_at < ?
      RETURNING slot`)
      .bind(slot, slotLeaseId, expiresAt, nowIso)
      .first<{ slot: number }>();
    if (reserved) return { slot: reserved.slot, slotLeaseId };
  }

  return null;
}

async function releaseModelSlot(
  db: ReturnType<typeof getDatabase>,
  lease: { slot: number; slotLeaseId: string },
) {
  await db.prepare("DELETE FROM model_request_leases WHERE slot = ? AND request_id = ?")
    .bind(lease.slot, lease.slotLeaseId)
    .run();
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

async function saveTerminalAdviceDelivery(
  db: ReturnType<typeof getDatabase>,
  requestId: string,
  delivery: ModelAdviceDelivery,
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await db.prepare(`INSERT INTO model_advice_deliveries
          (request_id, user_id, resume_id, request_fingerprint, response_json,
            attempt_state, created_at, updated_at, expires_at, terminal_at, failure_kind)
        VALUES (?, ?, ?, ?, ?, 'fallback', ?, ?, ?, ?, 'local-fallback')
        ON CONFLICT(request_id) DO UPDATE SET
          response_json = excluded.response_json,
          attempt_state = excluded.attempt_state,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          expires_at = excluded.expires_at,
          terminal_at = excluded.terminal_at,
          failure_kind = excluded.failure_kind
        WHERE model_advice_deliveries.user_id = excluded.user_id
          AND model_advice_deliveries.resume_id = excluded.resume_id
          AND model_advice_deliveries.request_fingerprint = excluded.request_fingerprint
          AND model_advice_deliveries.response_json = '__pending__'`)
        .bind(
          requestId,
          delivery.userId,
          delivery.resumeId,
          delivery.requestFingerprint,
          delivery.responseJson,
          delivery.createdAt,
          delivery.createdAt,
          delivery.expiresAt,
          delivery.createdAt,
        )
        .run();
      const stored = await db.prepare(`SELECT user_id, resume_id, request_fingerprint, response_json
        FROM model_advice_deliveries WHERE request_id = ?`)
        .bind(requestId)
        .first<{ user_id: string; resume_id: string; request_fingerprint: string; response_json: string }>();
      if (
        stored?.user_id === delivery.userId
        && stored.resume_id === delivery.resumeId
        && stored.request_fingerprint === delivery.requestFingerprint
        && stored.response_json === delivery.responseJson
      ) return;
      throw new Error("Advice delivery idempotency conflict");
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Advice delivery could not be stored");
}

async function createPendingAdviceDelivery(
  db: ReturnType<typeof getDatabase>,
  requestId: string,
  delivery: ModelAdviceDelivery & { providerKey: string },
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const stored = await db.prepare(`INSERT INTO model_advice_deliveries
          (request_id, user_id, resume_id, request_fingerprint, response_json,
            attempt_state, provider_key, created_at, updated_at, expires_at)
        VALUES (?, ?, ?, ?, '__pending__', 'prepared', ?, ?, ?, ?)
        ON CONFLICT(request_id) DO NOTHING
        RETURNING user_id, resume_id, request_fingerprint, response_json, attempt_state`)
        .bind(
          requestId,
          delivery.userId,
          delivery.resumeId,
          delivery.requestFingerprint,
          delivery.providerKey,
          delivery.createdAt,
          delivery.createdAt,
          delivery.expiresAt,
        )
        .first<{
          user_id: string;
          resume_id: string;
          request_fingerprint: string;
          response_json: string;
          attempt_state: string;
        }>();
      if (
        stored?.user_id === delivery.userId
        && stored.resume_id === delivery.resumeId
        && stored.request_fingerprint === delivery.requestFingerprint
        && stored.response_json === "__pending__"
        && stored.attempt_state === "prepared"
      ) return;
      throw new Error("Advice delivery idempotency conflict");
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Pending advice delivery could not be stored");
}

async function getAiAccessState(db: ReturnType<typeof getDatabase>, session: GuestSession) {
  if (session.kind === "user") {
    const identityHashes = await getSignupPromoIdentityHashes(
      db,
      session.userId,
      env.PROMO_REDEMPTION_PEPPER,
    );
    let balance = await ensureSignupCredits(db, session.userId, {
      identityHashes,
      recoverStale: false,
    });
    // Only accounts that appear empty need to pay for synchronous recovery.
    // A positive balance can proceed directly to the atomic reservation.
    if (balance.total === 0) {
      balance = await getCreditBalance(db, session.userId, { recoverStale: true });
    }
    return {
      creditBalance: balance.total,
      bonusCredits: balance.bonus,
      purchasedCredits: balance.purchased,
      nextExpiryAt: balance.nextExpiryAt,
      accountKind: "user" as const,
    };
  }
  const guestTrial = await getGuestTrialBalance(db, session.userId);
  return {
    creditBalance: guestTrial,
    bonusCredits: guestTrial,
    purchasedCredits: 0,
    nextExpiryAt: null,
    accountKind: "guest" as const,
  };
}

async function getCurrentAiAccessState(db: ReturnType<typeof getDatabase>, session: GuestSession) {
  const balance = await getCreditBalance(db, session.userId);
  return {
    creditBalance: balance.total,
    bonusCredits: balance.bonus,
    purchasedCredits: balance.purchased,
    nextExpiryAt: balance.nextExpiryAt,
    accountKind: session.kind === "user" ? "user" as const : "guest" as const,
  };
}

async function recordModelRunStart(
  db: ReturnType<typeof getDatabase>,
  requestId: string,
  userId: string,
  model: string,
  creditLedgerId: string | null,
  reservedInputTokens: number,
  ownerLeaseId: string,
) {
  // Keep a conservative cost reservation while the provider is running. If
  // usage is unavailable after a timeout or provider error, this upper-bound
  // remains in the daily budget instead of silently counting the call as free.
  const reservedUsage: ModelTokenUsage = {
    inputTokens: reservedInputTokens,
    cachedInputTokens: 0,
    outputTokens: DEEPSEEK_MAX_OUTPUT_TOKENS,
  };
  if (!creditLedgerId) return false;
  const now = new Date();
  const reserved = await reserveModelRunBudget(db, {
    requestId,
    userId,
    model,
    creditLedgerId,
    ownerLeaseId,
    reservedUsage,
    createdAt: now.toISOString(),
    dayStart: new Date(Math.floor(now.getTime() / 86_400_000) * 86_400_000).toISOString(),
    dailyBudgetMicros: modelDailyBudgetMicros(),
  });
  if (!reserved) return false;
  const started = await db.prepare(`UPDATE model_advice_deliveries
    SET attempt_state = 'provider_started', credit_ledger_id = ?, started_at = ?, updated_at = ?
    WHERE request_id = ? AND user_id = ? AND attempt_state = 'prepared'
    RETURNING request_id`)
    .bind(creditLedgerId, now.toISOString(), now.toISOString(), requestId, userId)
    .first<{ request_id: string }>();
  return Boolean(started);
}

function modelFailureKind(error: unknown) {
  if (error instanceof DeepSeekAdvisorError) return error.kind;
  return error instanceof Error ? error.name.slice(0, 80) : "unknown";
}

function modelDailyBudgetMicros() {
  const budget = getDeepSeekDailyBudgetMicros(env);
  if (budget === null) throw new ModelBudgetExceededError();
  return budget;
}

async function isProviderCircuitOpen(db: ReturnType<typeof getDatabase>, providerKey: string) {
  const state = await db.prepare("SELECT open_until FROM model_provider_state WHERE provider_key = ?")
    .bind(providerKey)
    .first<{ open_until: string | null }>();
  return Boolean(state?.open_until && state.open_until > new Date().toISOString());
}

async function isCurrentModelAvailable(db: ReturnType<typeof getDatabase>) {
  const config = getDeepSeekAdvisorConfig(env);
  if (!config || !isOneCreditDeepSeekModel(config.model)) return false;
  return !await isProviderCircuitOpen(db, `deepseek:${config.model}`);
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
  };
}

async function recommendationRequestFingerprint(value: unknown) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
