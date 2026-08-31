import type { getDatabase } from "@/../db";

type Database = ReturnType<typeof getDatabase>;

export interface OwnerLease {
  ownerKey: string;
  operationId: string;
  leaseId: string;
}

export interface OwnerLeaseAttempt {
  lease: OwnerLease | null;
  blockingOperationId: string | null;
}

/**
 * Serializes model work and destructive owner-lifecycle changes on the same
 * row. The INSERT/UPSERT is one atomic D1 statement, so a claim/delete cannot
 * slip between a model request's availability check and lease acquisition.
 */
export async function acquireOwnerLease(
  db: Database,
  ownerKey: string,
  operationId: string,
  ttlMs: number,
  now = new Date(),
): Promise<OwnerLeaseAttempt> {
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
  const leaseId = `${operationId}::lease::${crypto.randomUUID()}`;
  const acquired = await db.prepare(`INSERT INTO model_session_leases (owner_key, request_id, expires_at)
    SELECT id, ?, ? FROM users WHERE id = ?
    ON CONFLICT(owner_key) DO UPDATE SET request_id = excluded.request_id, expires_at = excluded.expires_at
    WHERE model_session_leases.expires_at < ?
    RETURNING owner_key`)
    .bind(leaseId, expiresAt, ownerKey, nowIso)
    .first<{ owner_key: string }>();
  if (acquired) {
    return {
      lease: { ownerKey, operationId, leaseId },
      blockingOperationId: null,
    };
  }

  const blocking = await db.prepare(`SELECT request_id FROM model_session_leases
    WHERE owner_key = ? AND expires_at >= ?`)
    .bind(ownerKey, nowIso)
    .first<{ request_id: string }>();
  return {
    lease: null,
    blockingOperationId: blocking ? logicalOperationId(blocking.request_id) : null,
  };
}

export async function releaseOwnerLease(db: Database, lease: OwnerLease) {
  await db.prepare("DELETE FROM model_session_leases WHERE owner_key = ? AND request_id = ?")
    .bind(lease.ownerKey, lease.leaseId)
    .run();
}

/** Extends only the exact, still-live lease held by this worker. */
export async function renewOwnerLease(
  db: Database,
  lease: OwnerLease,
  ttlMs: number,
  now = new Date(),
) {
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
  const renewed = await db.prepare(`UPDATE model_session_leases
    SET expires_at = ?
    WHERE owner_key = ? AND request_id = ? AND expires_at >= ?
      AND EXISTS (SELECT 1 FROM users WHERE id = ?)
    RETURNING owner_key`)
    .bind(expiresAt, lease.ownerKey, lease.leaseId, nowIso, lease.ownerKey)
    .first<{ owner_key: string }>();
  return Boolean(renewed);
}

function logicalOperationId(leaseId: string) {
  return leaseId.split("::lease::", 1)[0] ?? leaseId;
}
