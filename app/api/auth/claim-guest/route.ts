import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ensureDatabase, getDatabase, getGuestSession } from "@/../db";
import { apiError, rejectCrossOrigin, withApiError } from "@/lib/api";

export async function POST(request: Request) {
  try {
    const originError = rejectCrossOrigin(request);
    if (originError) return originError;
    await ensureDatabase();
    const authenticated = await auth.api.getSession({ headers: request.headers });
    if (!authenticated?.user) return apiError(401, "UNAUTHORIZED", "请先登录");
    const guest = await getGuestSession(request);
    if (!guest || guest.userId === authenticated.user.id) {
      return NextResponse.json({ claimed: false, resumeCount: 0 });
    }

    const db = getDatabase();
    const count = await db.prepare("SELECT COUNT(*) AS total FROM resumes WHERE user_id = ?")
      .bind(guest.userId)
      .first<{ total: number }>();
    await db.batch([
      db.prepare("UPDATE resumes SET user_id = ? WHERE user_id = ?").bind(authenticated.user.id, guest.userId),
      db.prepare("UPDATE resume_target_briefs SET user_id = ? WHERE user_id = ?").bind(authenticated.user.id, guest.userId),
      db.prepare("UPDATE advice_usage_events SET user_id = ? WHERE user_id = ?").bind(authenticated.user.id, guest.userId),
      db.prepare("UPDATE model_usage_events SET user_id = ? WHERE user_id = ?").bind(authenticated.user.id, guest.userId),
      db.prepare("UPDATE model_consent_events SET user_id = ? WHERE user_id = ?").bind(authenticated.user.id, guest.userId),
      db.prepare("UPDATE audit_events SET actor_id = ? WHERE actor_id = ?").bind(authenticated.user.id, guest.userId),
      db.prepare("DELETE FROM model_request_leases WHERE request_id IN (SELECT request_id FROM model_session_leases WHERE owner_key = ?)").bind(guest.userId),
      db.prepare("DELETE FROM model_session_leases WHERE owner_key = ?").bind(guest.userId),
      db.prepare("DELETE FROM guest_sessions WHERE user_id = ?").bind(guest.userId),
      db.prepare("DELETE FROM users WHERE id = ?").bind(guest.userId),
    ]);

    const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
    const response = NextResponse.json({ claimed: true, resumeCount: Number(count?.total ?? 0) });
    response.headers.append("set-cookie", `jianji_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
    response.headers.set("cache-control", "private, no-store");
    return response;
  } catch (error) {
    return withApiError(error);
  }
}
