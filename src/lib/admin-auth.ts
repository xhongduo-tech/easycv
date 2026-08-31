import { auth } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { getDatabase } from "@/../db";
import { hasCurrentLegalAcceptance } from "@/lib/legal-acceptance";

const ADMIN_MFA_WINDOW_MS = 12 * 60 * 60 * 1000;
const RECENT_AUTH_WINDOW_MS = 15 * 60 * 1000;

export async function requireAdminSession(
  request: Request,
  options: { recent?: boolean } = {},
) {
  const session = await auth.api.getSession({
    headers: request.headers,
    query: { disableCookieCache: true, disableRefresh: true },
  });
  if (!session?.user) {
    return { ok: false as const, response: apiError(401, "UNAUTHORIZED", "请先登录") };
  }
  const user = session.user as typeof session.user & {
    role?: string | null;
    twoFactorEnabled?: boolean | null;
  };
  if (user.role !== "admin") {
    return { ok: false as const, response: apiError(403, "FORBIDDEN", "需要管理员权限") };
  }
  if (!(await hasCurrentLegalAcceptance(getDatabase(), user.id))) {
    return {
      ok: false as const,
      response: apiError(428, "LEGAL_ACCEPTANCE_REQUIRED", "请先确认最新用户协议与隐私说明"),
    };
  }
  if (!user.twoFactorEnabled) {
    return {
      ok: false as const,
      response: apiError(403, "MFA_REQUIRED", "管理员必须先在账号中心启用双重验证"),
    };
  }
  const assurance = await getDatabase().prepare(`SELECT admin_mfa_verified_at
    FROM auth_sessions WHERE token = ? AND user_id = ? AND expires_at > ?`)
    .bind(session.session.token, user.id, new Date().toISOString())
    .first<{ admin_mfa_verified_at: string | null }>();
  const verifiedAt = assurance?.admin_mfa_verified_at
    ? new Date(assurance.admin_mfa_verified_at).getTime()
    : Number.NaN;
  if (!Number.isFinite(verifiedAt) || Date.now() - verifiedAt > ADMIN_MFA_WINDOW_MS) {
    return {
      ok: false as const,
      response: apiError(403, "MFA_REQUIRED", "管理员需要完成双重验证后再继续"),
    };
  }
  const createdAt = new Date(session.session.createdAt).getTime();
  if (options.recent && (!Number.isFinite(createdAt) || Date.now() - createdAt > RECENT_AUTH_WINDOW_MS)) {
    return {
      ok: false as const,
      response: apiError(403, "REAUTH_REQUIRED", "敏感管理操作需要重新登录后再执行"),
    };
  }
  return { ok: true as const, session: { ...session, user } };
}
