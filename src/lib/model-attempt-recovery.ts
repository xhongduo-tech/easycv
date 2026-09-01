import type { getDatabase } from "@/../db";

type Database = ReturnType<typeof getDatabase>;

export class ModelAttemptOwnerConflictError extends Error {
  constructor() {
    super("Request id belongs to another account");
    this.name = "ModelAttemptOwnerConflictError";
  }
}

export class ModelAttemptInconsistentError extends Error {
  constructor() {
    super("A settled model attempt is missing its replayable delivery");
    this.name = "ModelAttemptInconsistentError";
  }
}

export async function hasAbandonedModelAttempt(
  db: Database,
  requestId: string,
  userId: string,
) {
  const rows = await db.prepare(`SELECT user_id FROM model_usage_events WHERE id = ?
    UNION SELECT user_id FROM ai_credit_ledger WHERE request_id = ?
    UNION SELECT user_id FROM model_run_costs WHERE request_id = ?`)
    .bind(requestId, requestId, requestId)
    .all<{ user_id: string }>();
  if (!rows.results.length) return false;
  if (rows.results.some((row) => row.user_id !== userId)) {
    throw new ModelAttemptOwnerConflictError();
  }
  return true;
}

/**
 * Turns a crashed, non-settled attempt into a deterministic no-charge terminal
 * state. A consumed/succeeded attempt must have a delivery from the same
 * settlement batch and is never silently refunded here.
 */
export async function recoverAbandonedModelAttempt(
  db: Database,
  requestId: string,
  userId: string,
) {
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`UPDATE ai_credit_ledger
      SET status = 'released', release_reason = 'abandoned-request', settled_at = ?
      WHERE request_id = ? AND user_id = ? AND status = 'reserved'
        AND NOT EXISTS (SELECT 1 FROM model_run_costs
          WHERE request_id = ? AND user_id = ? AND status = 'succeeded')`)
      .bind(now, requestId, userId, requestId, userId),
    db.prepare(`UPDATE model_run_costs
      SET status = 'failed', failure_kind = 'abandoned-request', settled_at = ?
      WHERE request_id = ? AND user_id = ? AND status = 'running'
        AND NOT EXISTS (SELECT 1 FROM ai_credit_ledger
          WHERE request_id = ? AND user_id = ? AND status = 'consumed')`)
      .bind(now, requestId, userId, requestId, userId),
    db.prepare(`UPDATE model_advice_deliveries
      SET attempt_state = 'abandoned', failure_kind = 'abandoned-request', updated_at = ?, terminal_at = ?
      WHERE request_id = ? AND user_id = ?
        AND attempt_state IN ('prepared','provider_started','settlement_pending')
        AND NOT EXISTS (SELECT 1 FROM ai_credit_ledger
          WHERE request_id = ? AND user_id = ? AND status = 'consumed')
        AND NOT EXISTS (SELECT 1 FROM model_run_costs
          WHERE request_id = ? AND user_id = ? AND status = 'succeeded')`)
      .bind(now, now, requestId, userId, requestId, userId, requestId, userId),
  ]);

  const state = await db.prepare(`SELECT
      (SELECT status FROM ai_credit_ledger WHERE request_id = ? AND user_id = ?) AS ledger_status,
      (SELECT status FROM model_run_costs WHERE request_id = ? AND user_id = ?) AS cost_status`)
    .bind(requestId, userId, requestId, userId)
    .first<{ ledger_status: string | null; cost_status: string | null }>();
  if (state?.ledger_status === "consumed" || state?.cost_status === "succeeded") {
    throw new ModelAttemptInconsistentError();
  }
}

export async function expireExistingModelAttempt(
  db: Database,
  requestId: string,
  userId: string,
) {
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`UPDATE ai_credit_ledger
      SET status = 'released', release_reason = 'idempotency-expired', settled_at = ?
      WHERE request_id = ? AND user_id = ? AND status = 'reserved'`)
      .bind(now, requestId, userId),
    db.prepare(`UPDATE model_run_costs
      SET status = 'failed', failure_kind = 'idempotency-expired', settled_at = ?
      WHERE request_id = ? AND user_id = ? AND status = 'running'`)
      .bind(now, requestId, userId),
    db.prepare(`UPDATE model_advice_deliveries
      SET attempt_state = 'expired', failure_kind = 'idempotency-expired',
        response_json = '{}', updated_at = ?, terminal_at = ?
      WHERE request_id = ? AND user_id = ?
        AND attempt_state IN ('prepared','provider_started','settlement_pending','abandoned')`)
      .bind(now, now, requestId, userId),
  ]);
}

/** Reconciles a bounded batch of expired pending deliveries before advice is erased. */
export async function recoverExpiredPendingDeliveries(
  db: Database,
  now: string,
  limit = 50,
) {
  const batchLimit = Number.isSafeInteger(limit) && limit > 0 ? Math.min(limit, 50) : 50;
  const expiredSelector = `SELECT request_id FROM model_advice_deliveries
    WHERE attempt_state IN ('prepared','provider_started','settlement_pending','abandoned')
      AND expires_at <= ?
      AND NOT EXISTS (SELECT 1 FROM ai_credit_ledger
        WHERE ai_credit_ledger.request_id = model_advice_deliveries.request_id
          AND ai_credit_ledger.status = 'consumed')
      AND NOT EXISTS (SELECT 1 FROM model_run_costs
        WHERE model_run_costs.request_id = model_advice_deliveries.request_id
          AND model_run_costs.status = 'succeeded')
    ORDER BY expires_at, request_id LIMIT ?`;
  const results = await db.batch([
    db.prepare(`UPDATE ai_credit_ledger
      SET status = 'released', release_reason = 'pending-expired', settled_at = ?
      WHERE status = 'reserved' AND request_id IN (
        ${expiredSelector}
      )`)
      .bind(now, now, batchLimit),
    db.prepare(`UPDATE model_run_costs
      SET status = 'failed', failure_kind = 'pending-expired', settled_at = ?
      WHERE status = 'running' AND request_id IN (
        ${expiredSelector}
      )`)
      .bind(now, now, batchLimit),
    db.prepare(`UPDATE model_advice_deliveries
      SET response_json = '{}', attempt_state = 'expired',
        failure_kind = 'pending-expired', updated_at = ?, terminal_at = ?
      WHERE request_id IN (${expiredSelector})`)
      .bind(now, now, now, batchLimit),
  ]);
  const final = results[2] as { changes?: unknown; meta?: { changes?: unknown } } | undefined;
  return Number(final?.meta?.changes ?? final?.changes ?? 0);
}
