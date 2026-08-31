import type { GuestSession, getDatabase } from "@/../db";

type Database = ReturnType<typeof getDatabase>;

export const RESUME_LIMITS = {
  guest: { active: 3, total: 3 },
  user: { active: 50, total: 100 },
} as const;

export class ResumeLimitError extends Error {
  constructor() {
    super("Resume storage limit reached");
    this.name = "ResumeLimitError";
  }
}

export function limitsForSession(session: GuestSession) {
  return session.kind === "user" ? RESUME_LIMITS.user : RESUME_LIMITS.guest;
}

export async function assertGuestClaimWithinResumeLimits(
  db: Database,
  authenticatedUserId: string,
  guestUserId: string,
) {
  const counts = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM resumes WHERE user_id IN (?, ?)) AS total,
      (SELECT COUNT(*) FROM resumes WHERE user_id IN (?, ?) AND deleted_at IS NULL) AS active`)
    .bind(authenticatedUserId, guestUserId, authenticatedUserId, guestUserId)
    .first<{ total: number; active: number }>();
  if (
    Number(counts?.total ?? 0) > RESUME_LIMITS.user.total
    || Number(counts?.active ?? 0) > RESUME_LIMITS.user.active
  ) {
    throw new ResumeLimitError();
  }
}
