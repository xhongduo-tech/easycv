import type { getDatabase } from "@/../db";
import {
  CREDIT_RESERVATION_TTL_MS,
  DEEPSEEK_PRICE_VERSION,
  GUEST_AI_TRIALS,
  SIGNUP_AI_CREDITS,
  estimateDeepSeekCostMicros,
  type ModelTokenUsage,
} from "@/lib/pricing";
import { normalizeMainlandPhone } from "@/lib/auth-utils";

type Database = ReturnType<typeof getDatabase>;

export interface CreditBalance {
  total: number;
  bonus: number;
  purchased: number;
  nextExpiryAt: string | null;
}

export interface CreditReservation {
  id: string;
  requestId: string;
  userId: string;
  lotId: string;
}

export interface ModelAdviceDelivery {
  userId: string;
  resumeId: string;
  requestFingerprint: string;
  responseJson: string;
  createdAt: string;
  expiresAt: string;
}

export interface SignupCreditOptions {
  /** HMAC-SHA256 digests of every verified login identity. */
  identityHashes?: readonly string[] | null;
  credits?: number;
  /** Request paths that immediately reserve can defer stale recovery. */
  recoverStale?: boolean;
}

export class AiCreditSettlementUncertainError extends Error {
  constructor(cause?: unknown) {
    super("AI credit settlement state is temporarily unavailable", { cause });
    this.name = "AiCreditSettlementUncertainError";
  }
}

// D1 Free allows at most 50 statements in one Worker invocation. Settlement
// batches are idempotent, so one in-invocation retry is enough to recover a
// rolled-back batch while a still-uncertain request can safely continue under
// the same request id in a later invocation.
const MAX_SETTLEMENT_ATTEMPTS_PER_INVOCATION = 2;

export async function ensureSignupCredits(
  db: Database,
  userId: string,
  options: SignupCreditOptions = {},
) {
  const amount = Math.max(0, Math.min(
    SIGNUP_AI_CREDITS,
    Math.trunc(options.credits ?? SIGNUP_AI_CREDITS),
  ));
  const statements = createSignupCreditGrantStatements(db, {
    userId,
    identityHashes: options.identityHashes,
    credits: amount,
    now: new Date().toISOString(),
  });
  if (statements.length) await db.batch(statements);
  return getCreditBalance(db, userId, { recoverStale: options.recoverStale ?? true });
}

interface SignupCreditGrantInput {
  userId: string;
  identityHashes?: readonly string[] | null;
  credits: number;
  now: string;
  /** Guest claim only grants after every guest resume moved successfully. */
  requireNoResumesForUserId?: string;
}

/**
 * Builds one transactional three-statement grant:
 * 1. Link every submitted identity to an existing redemption cluster, or to a
 *    fresh one-time claim token when none has ever redeemed.
 * 2. Grant only when every identity belongs to that fresh token.
 * 3. Replace the temporary token with the durable user id after the lot exists.
 */
export function createSignupCreditGrantStatements(
  db: Database,
  input: SignupCreditGrantInput,
) {
  const identityHashes = Array.from(new Set(
    (input.identityHashes ?? [])
      .map((hash) => hash.trim().toLowerCase())
      .filter((hash) => /^[a-f0-9]{64}$/.test(hash)),
  )).sort();
  const credits = Math.max(0, Math.min(SIGNUP_AI_CREDITS, Math.trunc(input.credits)));
  if (!identityHashes.length || credits === 0) return [];
  const now = new Date(input.now);
  if (!Number.isFinite(now.getTime())) throw new Error("Signup credit grant time is invalid");
  const nowIso = now.toISOString();
  const retainedUntil = new Date(now.getTime() + 730 * 86_400_000).toISOString();
  const hashesJson = JSON.stringify(identityHashes);
  const claimToken = `${input.userId}::promo-claim::${crypto.randomUUID()}`;
  const eligibilitySql = input.requireNoResumesForUserId
    ? "AND NOT EXISTS (SELECT 1 FROM resumes WHERE user_id = ?)"
    : "";
  const eligibilityBindings = input.requireNoResumesForUserId
    ? [input.requireNoResumesForUserId]
    : [];

  return [
    db.prepare(`WITH submitted(identity_hash) AS (
        SELECT DISTINCT CAST(value AS TEXT) FROM json_each(?)
        WHERE type = 'text' AND length(value) = 64 AND value NOT GLOB '*[^0-9a-f]*'
      ), chosen(granted_user_id) AS (
        SELECT COALESCE((
          SELECT MIN(redemptions.granted_user_id)
          FROM signup_promo_redemptions AS redemptions
          JOIN submitted ON submitted.identity_hash = redemptions.identity_hash
          WHERE redemptions.retained_until > ?
        ), ?)
      )
      INSERT INTO signup_promo_redemptions
        (identity_hash, granted_user_id, campaign, created_at, retained_until)
      SELECT submitted.identity_hash, chosen.granted_user_id, 'launch-signup-v1', ?, ?
      FROM submitted CROSS JOIN chosen
      WHERE EXISTS (SELECT 1 FROM users WHERE id = ?)
        ${eligibilitySql}
      ON CONFLICT(identity_hash) DO UPDATE SET
        granted_user_id = excluded.granted_user_id,
        campaign = excluded.campaign,
        created_at = excluded.created_at,
        retained_until = excluded.retained_until
      WHERE signup_promo_redemptions.retained_until <= ?`)
      .bind(
        hashesJson,
        nowIso,
        claimToken,
        nowIso,
        retainedUntil,
        input.userId,
        ...eligibilityBindings,
        nowIso,
      ),
    db.prepare(`WITH submitted(identity_hash) AS (
        SELECT DISTINCT CAST(value AS TEXT) FROM json_each(?)
        WHERE type = 'text' AND length(value) = 64 AND value NOT GLOB '*[^0-9a-f]*'
      )
      INSERT INTO ai_credit_lots
        (id, user_id, source, reference_id, initial_credits, remaining_credits, expires_at, created_at)
      SELECT ?, ?, 'signup', 'launch-signup-v1', ?, ?, NULL, ?
      WHERE EXISTS (SELECT 1 FROM users WHERE id = ?)
        ${eligibilitySql}
        AND EXISTS (SELECT 1 FROM submitted)
        AND NOT EXISTS (
          SELECT 1 FROM submitted
          LEFT JOIN signup_promo_redemptions AS redemptions
            ON redemptions.identity_hash = submitted.identity_hash
          WHERE redemptions.identity_hash IS NULL
            OR redemptions.granted_user_id <> ?
            OR redemptions.retained_until <= ?
        )
      ON CONFLICT(user_id, source, reference_id) DO NOTHING`)
      .bind(
        hashesJson,
        `signup-${input.userId}`,
        input.userId,
        credits,
        credits,
        nowIso,
        input.userId,
        ...eligibilityBindings,
        claimToken,
        nowIso,
      ),
    db.prepare(`WITH submitted(identity_hash) AS (
        SELECT DISTINCT CAST(value AS TEXT) FROM json_each(?)
        WHERE type = 'text' AND length(value) = 64 AND value NOT GLOB '*[^0-9a-f]*'
      )
      UPDATE signup_promo_redemptions SET granted_user_id = ?
      WHERE granted_user_id = ?
        AND identity_hash IN (SELECT identity_hash FROM submitted)
        AND EXISTS (
          SELECT 1 FROM ai_credit_lots
          WHERE user_id = ? AND source = 'signup' AND reference_id = 'launch-signup-v1'
        )`)
      .bind(hashesJson, input.userId, claimToken, input.userId),
  ];
}

export async function getSignupPromoIdentityHashes(
  db: Database,
  userId: string,
  pepper: string | undefined,
) {
  if (!pepper || pepper.length < 32) return [];
  const rows = await db.prepare(`SELECT 'phone' AS kind, phone_number AS primary_value, NULL AS secondary_value
      FROM users WHERE id = ? AND phone_number_verified = 1 AND TRIM(phone_number) <> ''
    UNION ALL
    SELECT 'email' AS kind, email AS primary_value, NULL AS secondary_value
      FROM users WHERE id = ? AND email_verified = 1 AND TRIM(email) <> ''
    UNION ALL
    SELECT 'provider' AS kind, provider_id AS primary_value, account_id AS secondary_value
      FROM auth_accounts
      WHERE user_id = ? AND provider_id <> 'credential'
        AND TRIM(provider_id) <> '' AND TRIM(account_id) <> ''
    ORDER BY kind, primary_value, secondary_value`)
    .bind(userId, userId, userId)
    .all<{ kind: "phone" | "email" | "provider"; primary_value: string; secondary_value: string | null }>();
  const identities = Array.from(new Set(rows.results.flatMap((row) => {
    if (row.kind === "phone") {
      const normalized = normalizeMainlandPhone(row.primary_value);
      return normalized ? [`phone:${normalized}`] : [];
    }
    if (row.kind === "email") return [`email:${row.primary_value.trim().toLocaleLowerCase("en-US")}`];
    return row.secondary_value
      ? [`provider:${row.primary_value}:${row.secondary_value}`]
      : [];
  }))).sort();
  if (!identities.length) return [];
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digests = await Promise.all(identities.map(async (identity) => {
    const digest = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`jianji-signup-promo-v1\0${identity}`),
    );
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }));
  return Array.from(new Set(digests)).sort();
}

/**
 * Records every identity currently verified for a user as one promotion
 * cluster. This is deliberately safe to call from auth lifecycle hooks: the
 * underlying three-statement grant is idempotent, and an existing signup lot
 * prevents a second grant while still attaching newly verified identities.
 */
export async function syncSignupPromoIdentities(
  db: Database,
  userId: string,
  pepper: string | undefined,
  options: { now?: Date } = {},
) {
  const identityHashes = await getSignupPromoIdentityHashes(db, userId, pepper);
  const statements = createSignupCreditGrantStatements(db, {
    userId,
    identityHashes,
    credits: SIGNUP_AI_CREDITS,
    now: (options.now ?? new Date()).toISOString(),
  });
  if (statements.length) await db.batch(statements);
  return identityHashes;
}

export async function getCreditBalance(
  db: Database,
  userId: string,
  options: { recoverStale?: boolean } = {},
): Promise<CreditBalance> {
  if (options.recoverStale) await releaseStaleCreditReservations(db, userId);
  const now = new Date().toISOString();
  const row = await db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN source = 'purchase' THEN remaining_credits ELSE 0 END), 0) AS purchased,
      COALESCE(SUM(CASE WHEN source <> 'purchase' THEN remaining_credits ELSE 0 END), 0) AS bonus,
      MIN(CASE WHEN expires_at IS NOT NULL THEN expires_at END) AS next_expiry_at
    FROM ai_credit_lots
    WHERE user_id = ?
      AND remaining_credits > 0
      AND (expires_at IS NULL OR expires_at > ?)`)
    .bind(userId, now)
    .first<{ purchased: number; bonus: number; next_expiry_at: string | null }>();
  const purchased = Number(row?.purchased ?? 0);
  const bonus = Number(row?.bonus ?? 0);
  return {
    purchased,
    bonus,
    total: purchased + bonus,
    nextExpiryAt: row?.next_expiry_at ?? null,
  };
}

export async function reserveAiCredit(
  db: Database,
  userId: string,
  requestId: string,
  model: string,
): Promise<CreditReservation | null> {
  const now = new Date().toISOString();
  const reservation: CreditReservation = {
    id: crypto.randomUUID(),
    requestId,
    userId,
    lotId: "",
  };
  const applyReservation = () => db.batch([
    db.prepare(`INSERT INTO ai_credit_ledger
      (id, request_id, user_id, lot_id, credits, status, model, release_reason, created_at, settled_at)
      SELECT ?, ?, ?, id, 1, 'reserved', ?, NULL, ?, NULL
      FROM ai_credit_lots
      WHERE user_id = ?
        AND remaining_credits > 0
        AND (expires_at IS NULL OR expires_at > ?)
      ORDER BY CASE WHEN expires_at IS NULL THEN 1 ELSE 0 END, expires_at, created_at, id
      LIMIT 1`)
      .bind(reservation.id, requestId, userId, model, now, userId, now),
    db.prepare(`UPDATE ai_credit_lots
      SET remaining_credits = remaining_credits - 1
      WHERE id = (SELECT lot_id FROM ai_credit_ledger WHERE id = ? AND status = 'reserved')
        AND remaining_credits > 0`)
      .bind(reservation.id),
  ]);
  const readReservation = () => db.prepare(`SELECT id, lot_id FROM ai_credit_ledger
    WHERE request_id = ? AND user_id = ? AND status = 'reserved'`)
    .bind(requestId, userId)
    .first<{ id: string; lot_id: string }>();
  const attemptReservation = async () => {
    try {
      await applyReservation();
    } catch (error) {
      const existing = await readReservation().catch(() => null);
      if (existing) return { ...reservation, id: existing.id, lotId: existing.lot_id };
      throw error;
    }
    const ledger = await readReservation();
    return ledger ? { ...reservation, id: ledger.id, lotId: ledger.lot_id } : null;
  };

  // The overwhelmingly common success path should not pay two cleanup writes
  // before every reservation. If no spendable lot was found, recover an old
  // abandoned reservation and retry once; this preserves immediate recovery
  // for a user whose only credit was stranded by a crashed request.
  const reserved = await attemptReservation();
  if (reserved) return reserved;
  await releaseStaleCreditReservations(db, userId);
  return attemptReservation();
}

export async function commitAiCredit(db: Database, reservation: CreditReservation) {
  const committed = await db.prepare(`UPDATE ai_credit_ledger
    SET status = 'consumed', settled_at = ?
    WHERE id = ? AND user_id = ? AND status = 'reserved'
    RETURNING id`)
    .bind(new Date().toISOString(), reservation.id, reservation.userId)
    .first<{ id: string }>();
  return Boolean(committed);
}

export async function settleAiCreditForModelRun(
  db: Database,
  reservation: CreditReservation,
  model: string,
  usage: ModelTokenUsage,
  delivery: ModelAdviceDelivery,
) {
  const settledAt = new Date().toISOString();
  const applySettlement = async () => {
    const results = await db.batch([
      db.prepare(`UPDATE ai_credit_ledger
        SET status = 'consumed', settled_at = ?
        WHERE id = ? AND user_id = ? AND request_id = ? AND status = 'reserved'
          AND EXISTS (
            SELECT 1 FROM model_run_costs
            WHERE request_id = ? AND status = 'running' AND credit_ledger_id = ai_credit_ledger.id
          )`)
        .bind(
          settledAt,
          reservation.id,
          reservation.userId,
          reservation.requestId,
          reservation.requestId,
        ),
      db.prepare(`UPDATE model_run_costs SET
          status = 'succeeded', input_tokens = ?, cached_input_tokens = ?, output_tokens = ?,
          price_version = ?, estimated_cost_micros = ?, settled_at = ?
        WHERE request_id = ? AND status = 'running' AND credit_ledger_id = ?
          AND EXISTS (
            SELECT 1 FROM ai_credit_ledger
            WHERE id = ? AND user_id = ? AND status = 'consumed'
          )`)
        .bind(
          usage.inputTokens,
          usage.cachedInputTokens,
          usage.outputTokens,
          DEEPSEEK_PRICE_VERSION,
          estimateDeepSeekCostMicros(model, usage),
          settledAt,
          reservation.requestId,
          reservation.id,
          reservation.id,
          reservation.userId,
        ),
      db.prepare(`INSERT INTO model_advice_deliveries
          (request_id, user_id, resume_id, request_fingerprint, response_json,
            attempt_state, provider_key, credit_ledger_id, created_at, updated_at, expires_at, terminal_at, failure_kind)
        SELECT ?, ?, ?, ?, ?, 'succeeded', ?, ?, ?, ?, ?, ?, NULL
        WHERE EXISTS (
          SELECT 1 FROM model_run_costs
          JOIN ai_credit_ledger ON ai_credit_ledger.id = model_run_costs.credit_ledger_id
          WHERE model_run_costs.request_id = ?
            AND model_run_costs.status = 'succeeded'
            AND ai_credit_ledger.id = ?
            AND ai_credit_ledger.status = 'consumed'
        )
        ON CONFLICT(request_id) DO UPDATE SET
          response_json = excluded.response_json,
          attempt_state = excluded.attempt_state,
          provider_key = excluded.provider_key,
          credit_ledger_id = excluded.credit_ledger_id,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          expires_at = excluded.expires_at,
          terminal_at = excluded.terminal_at,
          failure_kind = NULL
        WHERE model_advice_deliveries.user_id = excluded.user_id
          AND model_advice_deliveries.resume_id = excluded.resume_id
          AND model_advice_deliveries.request_fingerprint = excluded.request_fingerprint
          AND model_advice_deliveries.response_json = '__pending__'`)
        .bind(
          reservation.requestId,
          delivery.userId,
          delivery.resumeId,
          delivery.requestFingerprint,
          delivery.responseJson,
          `deepseek:${model}`,
          reservation.id,
          delivery.createdAt,
          settledAt,
          delivery.expiresAt,
          settledAt,
          reservation.requestId,
          reservation.id,
        ),
    ]);
    return results.every((result) => resultChanges(result) === 1);
  };
  const isSettled = async () => {
    const settled = await db.prepare(`SELECT
        model_run_costs.status AS run_status,
        ai_credit_ledger.status AS ledger_status,
        model_advice_deliveries.attempt_state AS attempt_state,
        model_advice_deliveries.response_json AS response_json
      FROM model_run_costs
      JOIN ai_credit_ledger ON ai_credit_ledger.id = model_run_costs.credit_ledger_id
      JOIN model_advice_deliveries ON model_advice_deliveries.request_id = model_run_costs.request_id
      WHERE model_run_costs.request_id = ? AND ai_credit_ledger.id = ?
        AND model_advice_deliveries.user_id = ?
        AND model_advice_deliveries.request_fingerprint = ?`)
      .bind(
        reservation.requestId,
        reservation.id,
        delivery.userId,
        delivery.requestFingerprint,
      )
      .first<{ run_status: string; ledger_status: string; attempt_state: string; response_json: string }>();
    return settled?.run_status === "succeeded"
      && settled.ledger_status === "consumed"
      && settled.attempt_state === "succeeded"
      && settled.response_json === delivery.responseJson;
  };

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_SETTLEMENT_ATTEMPTS_PER_INVOCATION; attempt += 1) {
    try {
      // A resolved transactional batch with one changed row per statement is
      // definitive; do not introduce a fallible verification read afterward.
      if (await applySettlement()) return true;
    } catch (error) {
      lastError = error;
    }
    if (await isSettled().catch(() => false)) return true;
  }
  if (lastError) throw new AiCreditSettlementUncertainError(lastError);
  return false;
}

export async function settleFailedAiCreditForModelRun(
  db: Database,
  reservation: CreditReservation,
  model: string,
  failureKind: string,
  usage: ModelTokenUsage | undefined,
  delivery: ModelAdviceDelivery,
) {
  const settledAt = new Date().toISOString();
  const safeFailureKind = failureKind.slice(0, 80);
  const applyFailureSettlement = async () => {
    const costStatement = usage
      ? db.prepare(`UPDATE model_run_costs SET
          status = 'failed', input_tokens = ?, cached_input_tokens = ?, output_tokens = ?,
          price_version = ?, estimated_cost_micros = ?, failure_kind = ?, settled_at = ?
        WHERE request_id = ? AND user_id = ? AND status = 'running'`)
        .bind(
          usage.inputTokens,
          usage.cachedInputTokens,
          usage.outputTokens,
          DEEPSEEK_PRICE_VERSION,
          estimateDeepSeekCostMicros(model, usage),
          safeFailureKind,
          settledAt,
          reservation.requestId,
          reservation.userId,
        )
      : db.prepare(`UPDATE model_run_costs SET
          status = 'failed', failure_kind = ?, settled_at = ?
        WHERE request_id = ? AND user_id = ? AND status = 'running'`)
        .bind(safeFailureKind, settledAt, reservation.requestId, reservation.userId);
    const results = await db.batch([
      db.prepare(`UPDATE ai_credit_lots
        SET remaining_credits = remaining_credits + 1
        WHERE id = ?
          AND EXISTS (
            SELECT 1 FROM ai_credit_ledger
            WHERE id = ? AND user_id = ? AND lot_id = ai_credit_lots.id AND status = 'reserved'
          )`)
        .bind(reservation.lotId, reservation.id, reservation.userId),
      db.prepare(`UPDATE ai_credit_ledger
        SET status = 'released', release_reason = ?, settled_at = ?
        WHERE id = ? AND user_id = ? AND request_id = ? AND status = 'reserved'`)
        .bind(
          safeFailureKind,
          settledAt,
          reservation.id,
          reservation.userId,
          reservation.requestId,
        ),
      costStatement,
      db.prepare(`INSERT INTO model_advice_deliveries
          (request_id, user_id, resume_id, request_fingerprint, response_json,
            attempt_state, provider_key, credit_ledger_id, created_at, updated_at, expires_at, terminal_at, failure_kind)
        SELECT ?, ?, ?, ?, ?, 'fallback', ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM ai_credit_ledger
          WHERE id = ? AND request_id = ? AND user_id = ? AND status = 'released'
        )
          AND NOT EXISTS (
            SELECT 1 FROM model_run_costs
            WHERE request_id = ? AND status IN ('running', 'succeeded')
          )
        ON CONFLICT(request_id) DO UPDATE SET
          response_json = excluded.response_json,
          attempt_state = excluded.attempt_state,
          provider_key = excluded.provider_key,
          credit_ledger_id = excluded.credit_ledger_id,
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
          reservation.requestId,
          delivery.userId,
          delivery.resumeId,
          delivery.requestFingerprint,
          delivery.responseJson,
          `deepseek:${model}`,
          reservation.id,
          delivery.createdAt,
          settledAt,
          delivery.expiresAt,
          settledAt,
          safeFailureKind,
          reservation.id,
          reservation.requestId,
          reservation.userId,
          reservation.requestId,
        ),
    ]);
    return resultChanges(results[0]) === 1
      && resultChanges(results[1]) === 1
      && resultChanges(results[3]) === 1;
  };
  const isSettled = async () => {
    const row = await db.prepare(`SELECT ai_credit_ledger.status AS ledger_status,
        model_advice_deliveries.response_json AS response_json,
        model_advice_deliveries.attempt_state AS attempt_state,
        (SELECT status FROM model_run_costs WHERE request_id = ?) AS cost_status
      FROM ai_credit_ledger
      JOIN model_advice_deliveries ON model_advice_deliveries.request_id = ai_credit_ledger.request_id
      WHERE ai_credit_ledger.id = ? AND ai_credit_ledger.user_id = ?
        AND ai_credit_ledger.request_id = ?
        AND model_advice_deliveries.user_id = ?
        AND model_advice_deliveries.request_fingerprint = ?`)
      .bind(
        reservation.requestId,
        reservation.id,
        reservation.userId,
        reservation.requestId,
        delivery.userId,
        delivery.requestFingerprint,
      )
      .first<{ ledger_status: string; response_json: string; attempt_state: string; cost_status: string | null }>();
    return row?.ledger_status === "released"
      && row.response_json === delivery.responseJson
      && row.attempt_state === "fallback"
      && row.cost_status !== "running"
      && row.cost_status !== "succeeded";
  };

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_SETTLEMENT_ATTEMPTS_PER_INVOCATION; attempt += 1) {
    try {
      if (await applyFailureSettlement()) return true;
    } catch (error) {
      lastError = error;
    }
    if (await isSettled().catch(() => false)) return true;
  }
  throw new AiCreditSettlementUncertainError(lastError);
}

function resultChanges(result: unknown) {
  const value = result as { changes?: unknown; meta?: { changes?: unknown } };
  const changes = value.meta?.changes ?? value.changes;
  return typeof changes === "number" ? changes : Number(changes ?? 0);
}

export async function releaseAiCredit(
  db: Database,
  reservation: CreditReservation,
  reason: string,
) {
  const settledAt = new Date().toISOString();
  await db.batch([
    db.prepare(`UPDATE ai_credit_lots
      SET remaining_credits = remaining_credits + 1
      WHERE id = ?
        AND EXISTS (
          SELECT 1 FROM ai_credit_ledger
          WHERE id = ? AND user_id = ? AND lot_id = ai_credit_lots.id AND status = 'reserved'
        )`)
      .bind(reservation.lotId, reservation.id, reservation.userId),
    db.prepare(`UPDATE ai_credit_ledger
      SET status = 'released', release_reason = ?, settled_at = ?
      WHERE id = ? AND user_id = ? AND status = 'reserved'`)
      .bind(reason.slice(0, 80), settledAt, reservation.id, reservation.userId),
  ]);
}

export async function releaseStaleCreditReservations(db: Database, userId: string) {
  const cutoff = new Date(Date.now() - CREDIT_RESERVATION_TTL_MS).toISOString();
  const settledAt = new Date().toISOString();
  await db.batch([
    db.prepare(`UPDATE ai_credit_lots
      SET remaining_credits = remaining_credits + COALESCE((
        SELECT SUM(credits) FROM ai_credit_ledger
        WHERE ai_credit_ledger.lot_id = ai_credit_lots.id
          AND ai_credit_ledger.user_id = ?
          AND ai_credit_ledger.status = 'reserved'
          AND ai_credit_ledger.created_at < ?
          AND NOT EXISTS (
            SELECT 1 FROM model_run_costs
            WHERE model_run_costs.request_id = ai_credit_ledger.request_id
              AND model_run_costs.status IN ('running','succeeded')
          )
      ), 0)
      WHERE user_id = ?
        AND EXISTS (
          SELECT 1 FROM ai_credit_ledger
          WHERE ai_credit_ledger.lot_id = ai_credit_lots.id
            AND ai_credit_ledger.user_id = ?
            AND ai_credit_ledger.status = 'reserved'
            AND ai_credit_ledger.created_at < ?
            AND NOT EXISTS (
              SELECT 1 FROM model_run_costs
              WHERE model_run_costs.request_id = ai_credit_ledger.request_id
                AND model_run_costs.status IN ('running','succeeded')
            )
        )`)
      .bind(userId, cutoff, userId, userId, cutoff),
    db.prepare(`UPDATE ai_credit_ledger
      SET status = 'released', release_reason = 'reservation-expired', settled_at = ?
      WHERE user_id = ? AND status = 'reserved' AND created_at < ?
        AND NOT EXISTS (
          SELECT 1 FROM model_run_costs
          WHERE model_run_costs.request_id = ai_credit_ledger.request_id
            AND model_run_costs.status IN ('running','succeeded')
        )`)
      .bind(settledAt, userId, cutoff),
  ]);
}

export async function getGuestTrialBalance(db: Database, userId: string) {
  const used = await db.prepare(`SELECT COUNT(*) AS total
    FROM suggestion_events
    WHERE provider <> 'local-rules'
      AND resume_id IN (SELECT id FROM resumes WHERE user_id = ?)`)
    .bind(userId)
    .first<{ total: number }>();
  const credits = Math.max(0, GUEST_AI_TRIALS - Number(used?.total ?? 0));
  const now = new Date().toISOString();
  const session = await db.prepare(`SELECT MAX(expires_at) AS expires_at
    FROM guest_sessions WHERE user_id = ? AND expires_at > ?`)
    .bind(userId, now)
    .first<{ expires_at: string | null }>();
  const expiresAt = session?.expires_at ?? now;
  await db.prepare(`INSERT INTO ai_credit_lots
    (id, user_id, source, reference_id, initial_credits, remaining_credits, expires_at, created_at)
    VALUES (?, ?, 'guest-trial', 'launch-guest-v1', ?, ?, ?, ?)
    ON CONFLICT(user_id, source, reference_id) DO UPDATE SET expires_at = excluded.expires_at`)
    .bind(`guest-trial-${userId}`, userId, credits, credits, expiresAt, now)
    .run();
  const balance = await getCreditBalance(db, userId, { recoverStale: true });
  return balance.total;
}
