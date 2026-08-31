import type { getDatabase } from "@/../db";
import { createSignupCreditGrantStatements } from "@/lib/credits";
import { acquireOwnerLease, releaseOwnerLease } from "@/lib/owner-lease";
import { RESUME_LIMITS, ResumeLimitError } from "@/lib/resume-policy";

type Database = ReturnType<typeof getDatabase>;

const GUEST_CLAIM_LEASE_TTL_MS = 60_000;

export class GuestClaimBusyError extends Error {
  constructor() {
    super("Guest data is currently in use");
    this.name = "GuestClaimBusyError";
  }
}

export async function claimGuestApplicationData(
  db: Database,
  authenticatedUserId: string,
  guestUserId: string,
  now = new Date().toISOString(),
  signupIdentityHashes?: readonly string[] | null,
) {
  const operationId = `lifecycle:claim:${crypto.randomUUID()}`;
  const ownerAttempt = await acquireOwnerLease(
    db,
    guestUserId,
    operationId,
    GUEST_CLAIM_LEASE_TTL_MS,
    new Date(now),
  );
  if (!ownerAttempt.lease) throw new GuestClaimBusyError();

  try {
    const count = await db.prepare("SELECT COUNT(*) AS total FROM resumes WHERE user_id = ?")
      .bind(guestUserId)
      .first<{ total: number }>();
    const signupStatements = createSignupCreditGrantStatements(db, {
      userId: authenticatedUserId,
      identityHashes: signupIdentityHashes,
      credits: 5,
      now,
      requireNoResumesForUserId: guestUserId,
    });
    await db.batch([
    db.prepare(`WITH usage AS MATERIALIZED (
        SELECT
          (SELECT COUNT(*) FROM resumes WHERE user_id = ? AND deleted_at IS NULL) AS account_active,
          (SELECT COUNT(*) FROM resumes WHERE user_id = ? AND deleted_at IS NULL) AS guest_active,
          (SELECT COUNT(*) FROM resumes WHERE user_id = ?) AS account_total,
          (SELECT COUNT(*) FROM resumes WHERE user_id = ?) AS guest_total
      )
      UPDATE resumes SET user_id = ? WHERE user_id = ?
        AND EXISTS (SELECT 1 FROM usage
          WHERE account_active + guest_active <= ?
            AND account_total + guest_total <= ?)`)
      .bind(
        authenticatedUserId,
        guestUserId,
        authenticatedUserId,
        guestUserId,
        authenticatedUserId,
        guestUserId,
        RESUME_LIMITS.user.active,
        RESUME_LIMITS.user.total,
      ),
    db.prepare(`UPDATE resume_target_briefs SET user_id = ? WHERE user_id = ?
      AND NOT EXISTS (SELECT 1 FROM resumes WHERE user_id = ?)`)
      .bind(authenticatedUserId, guestUserId, guestUserId),
    db.prepare(`UPDATE advice_usage_events SET user_id = ? WHERE user_id = ?
      AND NOT EXISTS (SELECT 1 FROM resumes WHERE user_id = ?)`)
      .bind(authenticatedUserId, guestUserId, guestUserId),
    db.prepare(`UPDATE model_usage_events SET user_id = ? WHERE user_id = ?
      AND NOT EXISTS (SELECT 1 FROM resumes WHERE user_id = ?)`)
      .bind(authenticatedUserId, guestUserId, guestUserId),
    db.prepare(`UPDATE model_run_costs SET user_id = ? WHERE user_id = ?
      AND NOT EXISTS (SELECT 1 FROM resumes WHERE user_id = ?)`)
      .bind(authenticatedUserId, guestUserId, guestUserId),
    db.prepare(`UPDATE model_advice_deliveries SET user_id = ? WHERE user_id = ?
      AND NOT EXISTS (SELECT 1 FROM resumes WHERE user_id = ?)`)
      .bind(authenticatedUserId, guestUserId, guestUserId),
    db.prepare(`UPDATE model_consent_events SET user_id = ? WHERE user_id = ?
      AND NOT EXISTS (SELECT 1 FROM resumes WHERE user_id = ?)`)
      .bind(authenticatedUserId, guestUserId, guestUserId),
    db.prepare(`UPDATE audit_events SET actor_id = ? WHERE actor_id = ?
      AND NOT EXISTS (SELECT 1 FROM resumes WHERE user_id = ?)`)
      .bind(authenticatedUserId, guestUserId, guestUserId),
    db.prepare(`UPDATE ai_credit_ledger SET
        user_id = ?,
        status = CASE WHEN status = 'reserved' THEN 'released' ELSE status END,
        release_reason = CASE WHEN status = 'reserved' THEN 'guest-claimed' ELSE release_reason END,
        settled_at = CASE WHEN status = 'reserved' THEN ? ELSE settled_at END
      WHERE user_id = ?
        AND NOT EXISTS (SELECT 1 FROM resumes WHERE user_id = ?)`)
      .bind(authenticatedUserId, now, guestUserId, guestUserId),
    db.prepare(`UPDATE ai_credit_lots SET
        user_id = ?, source = 'guest-trial-history', reference_id = ?, remaining_credits = 0
      WHERE user_id = ?
        AND NOT EXISTS (SELECT 1 FROM resumes WHERE user_id = ?)`)
      .bind(authenticatedUserId, guestUserId, guestUserId, guestUserId),
    ...signupStatements,
    db.prepare(`DELETE FROM guest_sessions WHERE user_id = ?
      AND NOT EXISTS (SELECT 1 FROM resumes WHERE user_id = ?)`)
      .bind(guestUserId, guestUserId),
    db.prepare("DELETE FROM model_session_leases WHERE owner_key = ? AND request_id = ?")
      .bind(guestUserId, ownerAttempt.lease.leaseId),
    db.prepare(`DELETE FROM users WHERE id = ?
      AND NOT EXISTS (SELECT 1 FROM resumes WHERE user_id = ?)`)
      .bind(guestUserId, guestUserId),
    ]);
    const remaining = await db.prepare("SELECT COUNT(*) AS total FROM resumes WHERE user_id = ?")
      .bind(guestUserId)
      .first<{ total: number }>();
    if (Number(remaining?.total ?? 0) > 0) throw new ResumeLimitError();
    return Number(count?.total ?? 0);
  } finally {
    await releaseOwnerLease(db, ownerAttempt.lease).catch(() => undefined);
  }
}
