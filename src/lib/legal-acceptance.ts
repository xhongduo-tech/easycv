import type { getDatabase } from "@/../db";

type Database = ReturnType<typeof getDatabase>;

export const CURRENT_LEGAL_DOCUMENTS = {
  termsVersion: "terms-2026-09-01-v2",
  privacyVersion: "privacy-2026-09-01-v1",
} as const;

export class LegalAcceptanceRequiredError extends Error {
  constructor() {
    super("Current legal documents have not been accepted");
    this.name = "LegalAcceptanceRequiredError";
  }
}

export async function hasCurrentLegalAcceptance(db: Database, userId: string) {
  const result = await db.prepare(`SELECT 1 AS accepted
    FROM legal_acceptances
    WHERE user_id = ? AND terms_version = ? AND privacy_version = ?
    LIMIT 1`)
    .bind(
      userId,
      CURRENT_LEGAL_DOCUMENTS.termsVersion,
      CURRENT_LEGAL_DOCUMENTS.privacyVersion,
    )
    .first<{ accepted: number }>();
  return result?.accepted === 1;
}

export async function recordCurrentLegalAcceptance(
  db: Database,
  userId: string,
  acceptedAt = new Date().toISOString(),
) {
  const inserted = await db.prepare(`INSERT INTO legal_acceptances
    (id, user_id, terms_version, privacy_version, acceptance_method, accepted_at)
    VALUES (?, ?, ?, ?, 'consent-page', ?)
    ON CONFLICT(user_id, terms_version, privacy_version) DO NOTHING
    RETURNING accepted_at`)
    .bind(
      crypto.randomUUID(),
      userId,
      CURRENT_LEGAL_DOCUMENTS.termsVersion,
      CURRENT_LEGAL_DOCUMENTS.privacyVersion,
      acceptedAt,
    )
    .first<{ accepted_at: string }>();
  if (inserted) return { acceptedAt: inserted.accepted_at, created: true } as const;
  const existing = await db.prepare(`SELECT accepted_at FROM legal_acceptances
    WHERE user_id = ? AND terms_version = ? AND privacy_version = ?`)
    .bind(
      userId,
      CURRENT_LEGAL_DOCUMENTS.termsVersion,
      CURRENT_LEGAL_DOCUMENTS.privacyVersion,
    )
    .first<{ accepted_at: string }>();
  if (!existing) throw new Error("Legal acceptance could not be persisted");
  return { acceptedAt: existing.accepted_at, created: false } as const;
}
