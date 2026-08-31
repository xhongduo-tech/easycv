import type { getDatabase } from "@/../db";
import {
  createSignupCreditGrantStatements,
  getSignupPromoIdentityHashes,
} from "@/lib/credits";
import { SIGNUP_AI_CREDITS } from "@/lib/pricing";
import { acquireOwnerLease, releaseOwnerLease } from "@/lib/owner-lease";

type Database = ReturnType<typeof getDatabase>;

export class AccountDeletionBusyError extends Error {
  constructor() {
    super("请等待当前增强优化结束后再删除账号");
    this.name = "AccountDeletionBusyError";
  }
}

export async function deleteApplicationData(
  db: Database,
  userId: string,
  promoRedemptionPepper?: string,
) {
  const operationId = `lifecycle:delete:${crypto.randomUUID()}`;
  const ownerAttempt = await acquireOwnerLease(db, userId, operationId, 60_000);
  if (!ownerAttempt.lease) throw new AccountDeletionBusyError();
  try {
    const now = new Date().toISOString();
    const identityHashes = await getSignupPromoIdentityHashes(
      db,
      userId,
      promoRedemptionPepper,
    );
    const promoStatements = createSignupCreditGrantStatements(db, {
      userId,
      identityHashes,
      credits: SIGNUP_AI_CREDITS,
      now,
    });
    // The core user deletion is part of this same D1 transaction. Better
    // Auth's subsequent adapter deletes are idempotent no-ops, so a failure
    // cannot leave a live identity with erased application data and a newly
    // grantable signup-credit lot. The promotion-cluster statements run in
    // this transaction before identity rows are removed, closing the
    // bind-identity -> delete -> recreate bypass as well.
    await db.batch([
      ...promoStatements,
      db.prepare("DELETE FROM suggestion_events WHERE resume_id IN (SELECT id FROM resumes WHERE user_id = ?)").bind(userId),
      db.prepare("DELETE FROM resume_versions WHERE resume_id IN (SELECT id FROM resumes WHERE user_id = ?)").bind(userId),
      db.prepare("DELETE FROM resume_target_briefs WHERE user_id = ? OR resume_id IN (SELECT id FROM resumes WHERE user_id = ?)").bind(userId, userId),
      db.prepare("DELETE FROM model_consent_events WHERE user_id = ?").bind(userId),
      db.prepare("DELETE FROM legal_acceptances WHERE user_id = ?").bind(userId),
      db.prepare("DELETE FROM model_advice_deliveries WHERE user_id = ?").bind(userId),
      db.prepare("DELETE FROM ai_credit_ledger WHERE user_id = ?").bind(userId),
      db.prepare("DELETE FROM ai_credit_lots WHERE user_id = ?").bind(userId),
      db.prepare(`UPDATE signup_promo_redemptions
        SET granted_user_id = 'deleted-promo-' || lower(hex(randomblob(16)))
        WHERE granted_user_id = ?`).bind(userId),
      db.prepare(`UPDATE model_run_costs SET
          user_id = 'deleted-run-' || lower(hex(randomblob(16))),
          credit_ledger_id = NULL,
          status = CASE WHEN status = 'running' THEN 'failed' ELSE status END,
          failure_kind = CASE WHEN status = 'running' THEN 'account-deleted' ELSE failure_kind END,
          settled_at = CASE WHEN status = 'running' THEN ? ELSE settled_at END
        WHERE user_id = ?`).bind(now, userId),
      db.prepare("DELETE FROM credit_orders WHERE user_id = ? AND status <> 'paid'").bind(userId),
      db.prepare(`UPDATE credit_orders
        SET user_id = 'deleted-order-' || lower(hex(randomblob(16)))
        WHERE user_id = ? AND status = 'paid'`).bind(userId),
      db.prepare("DELETE FROM advice_usage_events WHERE user_id = ?").bind(userId),
      db.prepare("DELETE FROM model_usage_events WHERE user_id = ?").bind(userId),
      db.prepare("DELETE FROM audit_events WHERE actor_id = ?").bind(userId),
      db.prepare("DELETE FROM resumes WHERE user_id = ?").bind(userId),
      db.prepare("DELETE FROM guest_sessions WHERE user_id = ?").bind(userId),
      db.prepare("DELETE FROM model_session_leases WHERE owner_key = ? AND request_id = ?")
        .bind(userId, ownerAttempt.lease.leaseId),
      db.prepare("DELETE FROM users WHERE id = ?").bind(userId),
    ]);
  } finally {
    await releaseOwnerLease(db, ownerAttempt.lease).catch(() => undefined);
  }
}
