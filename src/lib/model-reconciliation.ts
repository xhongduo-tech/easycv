import type { getDatabase } from "@/../db";
import {
  ModelAttemptInconsistentError,
  recoverAbandonedModelAttempt,
} from "@/lib/model-attempt-recovery";
import { acquireOwnerLease, releaseOwnerLease } from "@/lib/owner-lease";

type Database = ReturnType<typeof getDatabase>;

const STALE_ATTEMPT_MS = 2 * 60 * 1000;
const MODEL_RECORD_RETENTION_MS = 90 * 86_400_000;
// Recovery uses seven D1 statements per stale attempt. Four keeps the whole
// maintenance invocation well below the Workers Free 50-query ceiling.
const MAX_RECOVERIES_PER_INVOCATION = 4;

export async function inspectModelReconciliation(db: Database, now = new Date()) {
  const staleBefore = new Date(now.getTime() - STALE_ATTEMPT_MS).toISOString();
  const retainedAfter = new Date(now.getTime() - MODEL_RECORD_RETENTION_MS).toISOString();
  const [stale, mismatches, missingDeliveries, lotDrift] = await Promise.all([
    db.prepare(`SELECT request_id, user_id, attempt_state FROM model_advice_deliveries
      WHERE attempt_state IN ('prepared','provider_started','settlement_pending')
        AND updated_at <= ?
        AND NOT EXISTS (SELECT 1 FROM model_session_leases
          WHERE model_session_leases.owner_key = model_advice_deliveries.user_id
            AND model_session_leases.expires_at > ?)
        AND NOT EXISTS (SELECT 1 FROM ai_credit_ledger
          WHERE ai_credit_ledger.request_id = model_advice_deliveries.request_id
            AND ai_credit_ledger.status = 'consumed')
        AND NOT EXISTS (SELECT 1 FROM model_run_costs
          WHERE model_run_costs.request_id = model_advice_deliveries.request_id
            AND model_run_costs.status = 'succeeded')
      ORDER BY updated_at LIMIT ${MAX_RECOVERIES_PER_INVOCATION}`).bind(staleBefore, now.toISOString()).all<{
        request_id: string;
        user_id: string;
        attempt_state: string;
      }>(),
    db.prepare(`SELECT COUNT(*) AS total FROM ai_credit_ledger ledger
      LEFT JOIN model_run_costs run ON run.request_id = ledger.request_id
      WHERE (ledger.status = 'consumed' AND ledger.created_at >= ?
          AND COALESCE(run.status, '') <> 'succeeded')
        OR (ledger.status = 'released' AND run.status = 'succeeded')`)
      .bind(retainedAfter)
      .first<{ total: number }>(),
    db.prepare(`SELECT COUNT(*) AS total FROM model_run_costs run
      LEFT JOIN model_advice_deliveries delivery ON delivery.request_id = run.request_id
      WHERE run.status IN ('succeeded','failed')
        AND run.created_at >= ?
        AND run.user_id NOT LIKE 'deleted-run-%'
        AND run.user_id NOT LIKE 'expired-guest-%'
        AND delivery.request_id IS NULL`)
      .bind(retainedAfter)
      .first<{ total: number }>(),
    db.prepare(`SELECT COUNT(*) AS total FROM ai_credit_lots lot
      WHERE lot.source <> 'guest-trial-history'
        AND lot.initial_credits - lot.remaining_credits <> COALESCE((
          SELECT SUM(ledger.credits) FROM ai_credit_ledger ledger
          WHERE ledger.lot_id = lot.id AND ledger.status IN ('reserved','consumed')
        ), 0)`)
      .first<{ total: number }>(),
  ]);
  return {
    staleAttempts: stale.results,
    ledgerRunMismatches: Number(mismatches?.total ?? 0),
    missingDeliveries: Number(missingDeliveries?.total ?? 0),
    lotDrift: Number(lotDrift?.total ?? 0),
  };
}

export async function runModelReconciliation(
  db: Database,
  options: { apply?: boolean; now?: Date } = {},
) {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const staleBefore = new Date(now.getTime() - STALE_ATTEMPT_MS).toISOString();
  const before = await inspectModelReconciliation(db, now);
  let recovered = 0;
  let inconsistentSkipped = 0;
  if (options.apply) {
    for (const attempt of before.staleAttempts) {
      const leaseAttempt = await acquireOwnerLease(
        db,
        attempt.user_id,
        `maintenance:reconcile:${attempt.request_id}`,
        60_000,
        now,
      );
      if (!leaseAttempt.lease) continue;
      try {
        const current = await db.prepare(`SELECT attempt_state FROM model_advice_deliveries
          WHERE request_id = ? AND user_id = ?
            AND attempt_state IN ('prepared','provider_started','settlement_pending')
            AND updated_at <= ?
            AND NOT EXISTS (SELECT 1 FROM ai_credit_ledger
              WHERE ai_credit_ledger.request_id = model_advice_deliveries.request_id
                AND ai_credit_ledger.status = 'consumed')
            AND NOT EXISTS (SELECT 1 FROM model_run_costs
              WHERE model_run_costs.request_id = model_advice_deliveries.request_id
                AND model_run_costs.status = 'succeeded')`)
          .bind(attempt.request_id, attempt.user_id, staleBefore)
          .first<{ attempt_state: string }>();
        if (!current) continue;

        try {
          await recoverAbandonedModelAttempt(db, attempt.request_id, attempt.user_id);
        } catch (error) {
          if (error instanceof ModelAttemptInconsistentError) {
            inconsistentSkipped += 1;
            continue;
          }
          throw error;
        }
        const expired = await db.prepare(`UPDATE model_advice_deliveries
          SET response_json = '{}', attempt_state = 'expired', updated_at = ?, terminal_at = ?
          WHERE request_id = ? AND user_id = ? AND attempt_state = 'abandoned'
          RETURNING request_id`)
          .bind(nowIso, nowIso, attempt.request_id, attempt.user_id)
          .first<{ request_id: string }>();
        if (!expired) continue;

        await db.prepare(`INSERT INTO audit_events
            (id, actor_id, action, resource_type, resource_id, metadata_json, created_at)
          VALUES (?, 'system', 'model.reconciled', 'model-request', ?, ?, ?)
          ON CONFLICT(id) DO NOTHING`)
          .bind(
            `reconcile:${attempt.request_id}:abandoned`,
            attempt.request_id,
            JSON.stringify({ from: current.attempt_state, to: "expired" }),
            nowIso,
          )
          .run();
        recovered += 1;
      } finally {
        await releaseOwnerLease(db, leaseAttempt.lease).catch(() => undefined);
      }
    }
  }
  return { dryRun: !options.apply, recovered, inconsistentSkipped, ...before };
}
