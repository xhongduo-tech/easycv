import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ensureDatabase, getDatabase, getGuestSession } from "@/../db";
import { apiError, rejectCrossOrigin, withApiError } from "@/lib/api";
import { claimGuestApplicationData, GuestClaimBusyError } from "@/lib/guest-claim";
import { hasCurrentLegalAcceptance } from "@/lib/legal-acceptance";
import { hasCurrentMfaAssurance } from "@/lib/session-assurance";
import { getSignupPromoIdentityHashes } from "@/lib/credits";

export async function POST(request: Request) {
  try {
    const originError = rejectCrossOrigin(request);
    if (originError) return originError;
    await ensureDatabase();
    const authenticated = await auth.api.getSession({ headers: request.headers });
    if (!authenticated?.user) return apiError(401, "UNAUTHORIZED", "请先登录");
    if (!(await hasCurrentLegalAcceptance(getDatabase(), authenticated.user.id))) {
      return apiError(428, "LEGAL_ACCEPTANCE_REQUIRED", "请先确认最新用户协议与隐私说明");
    }
    const authenticatedUser = authenticated.user as typeof authenticated.user & {
      twoFactorEnabled?: boolean | null;
    };
    if (!(await hasCurrentMfaAssurance(getDatabase(), {
      userId: authenticatedUser.id,
      sessionToken: authenticated.session.token,
      twoFactorEnabled: Boolean(authenticatedUser.twoFactorEnabled),
    }))) {
      return apiError(403, "MFA_REQUIRED", "请先完成当前会话的双重验证");
    }
    const guest = await getGuestSession(request);
    if (!guest || guest.userId === authenticated.user.id) {
      return NextResponse.json({ claimed: false, resumeCount: 0 });
    }

    const db = getDatabase();
    const identityHashes = await getSignupPromoIdentityHashes(
      db,
      authenticated.user.id,
      env.PROMO_REDEMPTION_PEPPER,
    );
    let resumeCount: number;
    try {
      resumeCount = await claimGuestApplicationData(
        db,
        authenticated.user.id,
        guest.userId,
        new Date().toISOString(),
        identityHashes,
      );
    } catch (error) {
      if (error instanceof GuestClaimBusyError) {
        return apiError(409, "MODEL_REQUEST_ACTIVE", "增强优化仍在处理中，请稍后重试登录迁移");
      }
      throw error;
    }

    const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
    const response = NextResponse.json({ claimed: true, resumeCount });
    response.headers.append("set-cookie", `jianji_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
    response.headers.set("cache-control", "private, no-store");
    return response;
  } catch (error) {
    return withApiError(error);
  }
}
