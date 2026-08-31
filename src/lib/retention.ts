import type { getDatabase } from "@/../db";
import { recoverExpiredPendingDeliveries } from "@/lib/model-attempt-recovery";

type Database = ReturnType<typeof getDatabase>;

const DAY_MS = 86_400_000;
const IDEMPOTENCY_TOMBSTONE_TTL_MS = 90 * DAY_MS;
const SOFT_DELETE_TTL_MS = 30 * DAY_MS;
const GUEST_GRACE_MS = 7 * DAY_MS;
const USAGE_TTL_MS = 2 * DAY_MS;

/** One due-count read, four recovery statements, and thirty-one bounded writes. */
export const RETENTION_MAINTENANCE_STATEMENT_BUDGET = 36;

export async function runRetentionMaintenance(
  db: Database,
  options: { apply?: boolean; now?: Date } = {},
) {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const deliveryDeleteBefore = new Date(now.getTime() - IDEMPOTENCY_TOMBSTONE_TTL_MS).toISOString();
  const softDeleteBefore = new Date(now.getTime() - SOFT_DELETE_TTL_MS).toISOString();
  const guestBefore = new Date(now.getTime() - GUEST_GRACE_MS).toISOString();
  const usageBefore = new Date(now.getTime() - USAGE_TTL_MS).toISOString();
  const due = await retentionDueCounts(
    db,
    nowIso,
    deliveryDeleteBefore,
    softDeleteBefore,
    guestBefore,
    usageBefore,
  );
  if (!options.apply) return { dryRun: true as const, ...due };

  const recoveredPendingAttempts = await recoverExpiredPendingDeliveries(db, nowIso, 50);
  const deletedResumeSelector = `SELECT id FROM resumes
    WHERE deleted_at IS NOT NULL AND deleted_at <= ? ORDER BY deleted_at, id LIMIT 100`;
  const expiredGuestSelector = `SELECT id FROM users
    WHERE id LIKE 'guest-%' AND created_at <= ?1
      AND NOT EXISTS (SELECT 1 FROM guest_sessions
        WHERE guest_sessions.user_id = users.id AND guest_sessions.expires_at > ?2)
      AND NOT EXISTS (SELECT 1 FROM model_session_leases
        WHERE model_session_leases.owner_key = users.id AND model_session_leases.expires_at > ?2)
      AND NOT EXISTS (SELECT 1 FROM model_advice_deliveries
        WHERE model_advice_deliveries.user_id = users.id
          AND model_advice_deliveries.attempt_state IN ('prepared','provider_started','settlement_pending','abandoned'))
    ORDER BY created_at, id LIMIT 50`;
  const results = await db.batch([
    db.prepare(`UPDATE model_advice_deliveries
      SET response_json = '{}', attempt_state = 'expired', updated_at = ?, terminal_at = COALESCE(terminal_at, ?)
      WHERE request_id IN (SELECT request_id FROM model_advice_deliveries
        WHERE expires_at <= ?
          AND attempt_state IN ('succeeded','fallback','abandoned','expired')
          AND response_json NOT IN ('{}','__pending__')
        ORDER BY expires_at, request_id LIMIT 500)`)
      .bind(nowIso, nowIso, nowIso),
    db.prepare(`DELETE FROM model_advice_deliveries WHERE request_id IN (
      SELECT request_id FROM model_advice_deliveries
      WHERE expires_at < ? AND attempt_state = 'expired' AND response_json = '{}'
      ORDER BY expires_at, request_id LIMIT 500
    )`).bind(deliveryDeleteBefore),
    db.prepare(`DELETE FROM model_run_costs WHERE request_id IN (
      SELECT request_id FROM model_run_costs
      WHERE created_at < ? AND status IN ('succeeded','failed')
      ORDER BY created_at, request_id LIMIT 500
    )`).bind(deliveryDeleteBefore),
    db.prepare(`DELETE FROM signup_promo_redemptions WHERE identity_hash IN (
      SELECT identity_hash FROM signup_promo_redemptions
      WHERE retained_until <= ? ORDER BY retained_until, identity_hash LIMIT 500
    )`).bind(nowIso),
    db.prepare(`DELETE FROM advice_usage_events WHERE id IN (
      SELECT id FROM advice_usage_events WHERE created_at < ? LIMIT 500
    )`).bind(usageBefore),
    db.prepare(`DELETE FROM model_usage_events WHERE id IN (
      SELECT id FROM model_usage_events WHERE created_at < ? LIMIT 500
    )`).bind(usageBefore),
    db.prepare(`DELETE FROM guest_session_usage_events WHERE id IN (
      SELECT id FROM guest_session_usage_events WHERE created_at < ? LIMIT 500
    )`).bind(usageBefore),
    db.prepare(`DELETE FROM resume_versions WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY resume_id ORDER BY revision DESC) AS position
        FROM resume_versions
      ) WHERE position > 50 LIMIT 500
    )`),
    db.prepare(`DELETE FROM suggestion_events WHERE resume_id IN (${deletedResumeSelector})`)
      .bind(softDeleteBefore),
    db.prepare(`DELETE FROM resume_versions WHERE resume_id IN (${deletedResumeSelector})`)
      .bind(softDeleteBefore),
    db.prepare(`DELETE FROM resume_target_briefs WHERE resume_id IN (${deletedResumeSelector})`)
      .bind(softDeleteBefore),
    db.prepare(`DELETE FROM model_consent_events WHERE resume_id IN (${deletedResumeSelector})`)
      .bind(softDeleteBefore),
    db.prepare(`DELETE FROM resumes WHERE id IN (${deletedResumeSelector})`)
      .bind(softDeleteBefore),
    db.prepare(`DELETE FROM model_request_leases WHERE request_id IN (
      SELECT request_id FROM model_session_leases WHERE owner_key IN (${expiredGuestSelector})
    )`).bind(guestBefore, nowIso),
    db.prepare(`DELETE FROM suggestion_events WHERE resume_id IN (
      SELECT id FROM resumes WHERE user_id IN (${expiredGuestSelector})
    )`).bind(guestBefore, nowIso),
    db.prepare(`DELETE FROM resume_versions WHERE resume_id IN (
      SELECT id FROM resumes WHERE user_id IN (${expiredGuestSelector})
    )`).bind(guestBefore, nowIso),
    db.prepare(`DELETE FROM resume_target_briefs WHERE user_id IN (${expiredGuestSelector})`)
      .bind(guestBefore, nowIso),
    db.prepare(`DELETE FROM model_consent_events WHERE user_id IN (${expiredGuestSelector})`)
      .bind(guestBefore, nowIso),
    db.prepare(`DELETE FROM model_advice_deliveries WHERE user_id IN (${expiredGuestSelector})`)
      .bind(guestBefore, nowIso),
    db.prepare(`UPDATE model_run_costs SET
        user_id = 'expired-guest-' || request_id,
        credit_ledger_id = NULL,
        status = CASE WHEN status = 'running' THEN 'failed' ELSE status END,
        failure_kind = CASE WHEN status = 'running' THEN 'guest-expired' ELSE failure_kind END,
        settled_at = CASE WHEN status = 'running' THEN ?3 ELSE settled_at END
      WHERE user_id IN (${expiredGuestSelector})`).bind(guestBefore, nowIso, nowIso),
    db.prepare(`DELETE FROM ai_credit_ledger WHERE user_id IN (${expiredGuestSelector})`)
      .bind(guestBefore, nowIso),
    db.prepare(`DELETE FROM ai_credit_lots WHERE user_id IN (${expiredGuestSelector})`)
      .bind(guestBefore, nowIso),
    db.prepare(`DELETE FROM credit_orders
      WHERE user_id IN (${expiredGuestSelector}) AND status <> 'paid'`)
      .bind(guestBefore, nowIso),
    db.prepare(`UPDATE credit_orders SET user_id = 'expired-order-' || id
      WHERE user_id IN (${expiredGuestSelector}) AND status = 'paid'`)
      .bind(guestBefore, nowIso),
    db.prepare(`DELETE FROM advice_usage_events WHERE user_id IN (${expiredGuestSelector})`)
      .bind(guestBefore, nowIso),
    db.prepare(`DELETE FROM model_usage_events WHERE user_id IN (${expiredGuestSelector})`)
      .bind(guestBefore, nowIso),
    db.prepare(`DELETE FROM audit_events WHERE actor_id IN (${expiredGuestSelector})`)
      .bind(guestBefore, nowIso),
    db.prepare(`DELETE FROM resumes WHERE user_id IN (${expiredGuestSelector})`)
      .bind(guestBefore, nowIso),
    db.prepare(`DELETE FROM guest_sessions WHERE user_id IN (${expiredGuestSelector})`)
      .bind(guestBefore, nowIso),
    db.prepare(`DELETE FROM model_session_leases WHERE owner_key IN (${expiredGuestSelector})`)
      .bind(guestBefore, nowIso),
    db.prepare(`DELETE FROM users WHERE id IN (${expiredGuestSelector})`)
      .bind(guestBefore, nowIso),
  ]);
  return {
    dryRun: false as const,
    ...due,
    recoveredPendingAttempts,
    adviceBodiesErased: changes(results[0]),
    adviceTombstonesDeleted: changes(results[1]),
    modelCostsDeleted: changes(results[2]),
    promoRedemptionsDeleted: changes(results[3]),
    usageEventsDeleted: changes(results[4]) + changes(results[5]) + changes(results[6]),
    oldVersionsDeleted: changes(results[7]),
    softDeletedResumesPurged: changes(results[12]),
    expiredGuestsPurged: changes(results[30]),
  };
}

async function retentionDueCounts(
  db: Database,
  now: string,
  deliveryDeleteBefore: string,
  softDeleteBefore: string,
  guestBefore: string,
  usageBefore: string,
) {
  const counts = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM model_advice_deliveries
        WHERE expires_at <= ?1
          AND attempt_state IN ('succeeded','fallback','abandoned','expired')
          AND response_json NOT IN ('{}','__pending__')) AS bodies,
      (SELECT COUNT(*) FROM model_advice_deliveries
        WHERE expires_at <= ?1
          AND attempt_state IN ('prepared','provider_started','settlement_pending','abandoned')) AS pending,
      (SELECT COUNT(*) FROM model_advice_deliveries
        WHERE expires_at < ?2 AND attempt_state = 'expired' AND response_json = '{}') AS tombstones,
      (SELECT COUNT(*) FROM model_run_costs
        WHERE created_at < ?2 AND status IN ('succeeded','failed')) AS costs,
      (SELECT COUNT(*) FROM signup_promo_redemptions WHERE retained_until <= ?1) AS promos,
      (SELECT COUNT(*) FROM resumes
        WHERE deleted_at IS NOT NULL AND deleted_at <= ?3) AS soft_deleted,
      (SELECT COUNT(*) FROM users WHERE id LIKE 'guest-%' AND created_at <= ?4
        AND NOT EXISTS (SELECT 1 FROM guest_sessions
          WHERE guest_sessions.user_id = users.id AND guest_sessions.expires_at > ?1)
        AND NOT EXISTS (SELECT 1 FROM model_session_leases
          WHERE model_session_leases.owner_key = users.id AND model_session_leases.expires_at > ?1)
        AND NOT EXISTS (SELECT 1 FROM model_advice_deliveries
          WHERE model_advice_deliveries.user_id = users.id
            AND model_advice_deliveries.attempt_state IN ('prepared','provider_started','settlement_pending','abandoned'))) AS guests,
      ((SELECT COUNT(*) FROM advice_usage_events WHERE created_at < ?5)
        + (SELECT COUNT(*) FROM model_usage_events WHERE created_at < ?5)
        + (SELECT COUNT(*) FROM guest_session_usage_events WHERE created_at < ?5)) AS usage,
      (SELECT COUNT(*) FROM (
        SELECT ROW_NUMBER() OVER (PARTITION BY resume_id ORDER BY revision DESC) AS position
        FROM resume_versions
      ) WHERE position > 50) AS old_versions`)
    .bind(now, deliveryDeleteBefore, softDeleteBefore, guestBefore, usageBefore)
    .first<{
      bodies: number;
      pending: number;
      tombstones: number;
      costs: number;
      promos: number;
      soft_deleted: number;
      guests: number;
      usage: number;
      old_versions: number;
    }>();
  return {
    adviceBodiesDue: Number(counts?.bodies ?? 0),
    pendingAttemptsDue: Number(counts?.pending ?? 0),
    adviceTombstonesDue: Number(counts?.tombstones ?? 0),
    modelCostsDue: Number(counts?.costs ?? 0),
    promoRedemptionsDue: Number(counts?.promos ?? 0),
    softDeletedResumesDue: Number(counts?.soft_deleted ?? 0),
    expiredGuestsDue: Number(counts?.guests ?? 0),
    usageEventsDue: Number(counts?.usage ?? 0),
    oldVersionsDue: Number(counts?.old_versions ?? 0),
  };
}

function changes(result: unknown) {
  const value = result as { changes?: unknown; meta?: { changes?: unknown } };
  return Number(value.meta?.changes ?? value.changes ?? 0);
}
