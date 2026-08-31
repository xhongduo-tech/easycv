import { auth, isConfiguredAdminEmail } from "@/lib/auth";
import { ensureDatabase, getDatabase, recordAudit } from "@/../db";
import { requireAdminSession } from "@/lib/admin-auth";
import { apiError } from "@/lib/api";

const RECENT_ADMIN_ACTIONS = new Set(["set-role", "ban-user", "unban-user"]);
const SENSITIVE_TWO_FACTOR_ACTIONS = new Set([
  "two-factor/get-totp-uri",
  "two-factor/generate-backup-codes",
]);
const ADMIN_BOOTSTRAP_FRESH_WINDOW_MS = 15 * 60 * 1000;

async function handle(request: Request) {
  await ensureDatabase();
  const url = new URL(request.url);
  const adminAction = url.pathname.match(/\/api\/auth\/admin\/([^/]+)/)?.[1];
  const authAction = url.pathname.match(/\/api\/auth\/(.+)$/)?.[1] ?? "";

  if (authAction.startsWith("two-factor/")) {
    const current = await auth.api.getSession({
      headers: request.headers,
      query: { disableCookieCache: true, disableRefresh: true },
    });
    const currentUser = current?.user as ({
      role?: string;
      email?: string;
      twoFactorEnabled?: boolean;
    }) | undefined;
    const currentSession = current?.session as ({
      createdAt: string | Date;
      impersonatedBy?: string | null;
    }) | undefined;
    if (
      authAction === "two-factor/enable"
      && (
        currentUser?.role === "admin"
        || (currentUser?.email && isConfiguredAdminEmail(currentUser.email))
      )
      && !currentUser.twoFactorEnabled
    ) {
      const createdAt = currentSession ? new Date(currentSession.createdAt).getTime() : Number.NaN;
      if (
        currentSession?.impersonatedBy
        || !Number.isFinite(createdAt)
        || Date.now() - createdAt > ADMIN_BOOTSTRAP_FRESH_WINDOW_MS
      ) return apiError(403, "REAUTH_REQUIRED", "管理员首次绑定双重验证前需要重新登录");
    }
    if (authAction === "two-factor/disable" && currentUser?.role === "admin") {
      return apiError(403, "FORBIDDEN", "请先由另一位管理员撤销管理员角色，再关闭双重验证");
    }
    const protectsExistingFactor = SENSITIVE_TWO_FACTOR_ACTIONS.has(authAction)
      || (authAction === "two-factor/enable" && currentUser?.twoFactorEnabled);
    if (currentUser?.role === "admin" && protectsExistingFactor) {
      const authorization = await requireAdminSession(request, { recent: true });
      if (!authorization.ok) return authorization.response;
    }
  }

  if (!adminAction) {
    const response = await auth.handler(request);
    if (response.ok && new Set([
      "two-factor/verify-totp",
      "two-factor/verify-backup-code",
    ]).has(authAction)) {
      const body = await response.clone().json().catch(() => null) as {
        token?: unknown;
        user?: { id?: unknown; email?: unknown };
      } | null;
      if (typeof body?.token === "string" && body.token) {
        const now = new Date().toISOString();
        await getDatabase().prepare(`UPDATE auth_sessions SET admin_mfa_verified_at = ? WHERE token = ?`)
          .bind(now, body.token).run();
        if (
          typeof body.user?.id === "string"
          && typeof body.user.email === "string"
          && isConfiguredAdminEmail(body.user.email)
        ) {
          await getDatabase().prepare("UPDATE users SET role = 'admin', updated_at = ? WHERE id = ?")
            .bind(now, body.user.id)
            .run();
          await recordAudit(body.user.id, "admin.bootstrap.completed", "user", body.user.id, {
            factor: "totp",
          });
        }
      }
    }
    return response;
  }

  const authorization = await requireAdminSession(request, {
    recent: request.method !== "GET" && RECENT_ADMIN_ACTIONS.has(adminAction),
  });
  if (!authorization.ok) return authorization.response;

  const payload = request.method === "GET"
    ? null
    : await request.clone().json().catch(() => null) as Record<string, unknown> | null;
  const targetId = typeof payload?.userId === "string" ? payload.userId : "admin-directory";
  const resourceType = adminAction === "list-users" ? "admin-directory" : "user";
  await recordAudit(
    authorization.session.user.id,
    `admin.${adminAction}.attempted`,
    resourceType,
    targetId,
    { method: request.method },
  );
  const response = await auth.handler(request);
  if (response.ok) {
    await recordAudit(
      authorization.session.user.id,
      `admin.${adminAction}.succeeded`,
      resourceType,
      targetId,
      { status: response.status },
    );
  }
  response.headers.set("cache-control", "private, no-store");
  return response;
}

export { handle as GET, handle as POST };
