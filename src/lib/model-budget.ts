import type { getDatabase } from "@/../db";
import {
  DEEPSEEK_PRICE_VERSION,
  estimateDeepSeekCostMicros,
  type ModelTokenUsage,
} from "@/lib/pricing";

type Database = ReturnType<typeof getDatabase>;

export interface ModelRunBudgetReservation {
  requestId: string;
  userId: string;
  model: string;
  creditLedgerId: string;
  ownerLeaseId: string;
  reservedUsage: ModelTokenUsage;
  createdAt: string;
  dayStart: string;
  dailyBudgetMicros: number;
}

/** Atomically adds this run's conservative reservation to the daily spend. */
export async function reserveModelRunBudget(
  db: Database,
  reservation: ModelRunBudgetReservation,
) {
  const estimatedCostMicros = estimateDeepSeekCostMicros(
    reservation.model,
    reservation.reservedUsage,
  );
  const inserted = await db.prepare(`INSERT INTO model_run_costs
      (request_id, user_id, model, status, input_tokens, cached_input_tokens, output_tokens,
        price_version, estimated_cost_micros, credit_ledger_id, failure_kind, created_at, settled_at)
    SELECT ?, ?, ?, 'running', ?, ?, ?, ?, ?, ?, NULL, ?, NULL
    WHERE EXISTS (
      SELECT 1 FROM ai_credit_ledger
      WHERE id = ? AND request_id = ? AND user_id = ? AND status = 'reserved'
    )
      AND EXISTS (
        SELECT 1 FROM model_advice_deliveries
        WHERE request_id = ? AND user_id = ? AND attempt_state = 'prepared'
      )
      AND EXISTS (
        SELECT 1 FROM model_session_leases
        WHERE owner_key = ? AND request_id = ? AND expires_at >= ?
      )
      AND ? + COALESCE((
      SELECT SUM(estimated_cost_micros) FROM model_run_costs WHERE created_at >= ?
    ), 0) <= ?
    RETURNING request_id`)
    .bind(
      reservation.requestId,
      reservation.userId,
      reservation.model,
      reservation.reservedUsage.inputTokens,
      reservation.reservedUsage.cachedInputTokens,
      reservation.reservedUsage.outputTokens,
      DEEPSEEK_PRICE_VERSION,
      estimatedCostMicros,
      reservation.creditLedgerId,
      reservation.createdAt,
      reservation.creditLedgerId,
      reservation.requestId,
      reservation.userId,
      reservation.requestId,
      reservation.userId,
      reservation.userId,
      reservation.ownerLeaseId,
      reservation.createdAt,
      estimatedCostMicros,
      reservation.dayStart,
      reservation.dailyBudgetMicros,
    )
    .first<{ request_id: string }>();
  return Boolean(inserted);
}
