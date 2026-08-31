import type { getDatabase } from "@/../db";

type Database = ReturnType<typeof getDatabase>;

export const MFA_ASSURANCE_WINDOW_MS = 12 * 60 * 60 * 1000;

export class MfaVerificationRequiredError extends Error {
  constructor() {
    super("The current session requires two-factor verification");
    this.name = "MfaVerificationRequiredError";
  }
}

export async function hasCurrentMfaAssurance(
  db: Database,
  input: { userId: string; sessionToken: string; twoFactorEnabled: boolean },
  now = new Date(),
) {
  if (!input.twoFactorEnabled) return true;
  const row = await db.prepare(`SELECT admin_mfa_verified_at
    FROM auth_sessions WHERE token = ? AND user_id = ? AND expires_at > ?`)
    .bind(input.sessionToken, input.userId, now.toISOString())
    .first<{ admin_mfa_verified_at: string | null }>();
  const verifiedAt = row?.admin_mfa_verified_at
    ? new Date(row.admin_mfa_verified_at).getTime()
    : Number.NaN;
  return Number.isFinite(verifiedAt)
    && now.getTime() - verifiedAt <= MFA_ASSURANCE_WINDOW_MS;
}
