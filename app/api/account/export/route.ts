import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ensureDatabase, getDatabase, recordAudit } from "@/../db";
import { apiError, rejectCrossOrigin, withApiError } from "@/lib/api";
import { buildAccountExport } from "@/lib/account-export";
import { hasCurrentMfaAssurance } from "@/lib/session-assurance";

const EXPORT_FRESH_WINDOW_MS = 60 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const originError = rejectCrossOrigin(request);
    if (originError) return originError;
    await ensureDatabase();
    const session = await auth.api.getSession({
      headers: request.headers,
      query: { disableCookieCache: true, disableRefresh: true },
    });
    if (!session?.user) return apiError(401, "UNAUTHORIZED", "请先登录");
    const sessionRecord = session.session as typeof session.session & { impersonatedBy?: string | null };
    if (sessionRecord.impersonatedBy) {
      return apiError(403, "FORBIDDEN", "模拟登录会话不能导出目标账号数据");
    }
    const user = session.user as typeof session.user & { twoFactorEnabled?: boolean | null };
    if (!(await hasCurrentMfaAssurance(getDatabase(), {
      userId: user.id,
      sessionToken: session.session.token,
      twoFactorEnabled: Boolean(user.twoFactorEnabled),
    }))) return apiError(403, "MFA_REQUIRED", "请先完成当前会话的双重验证");
    const sessionCreatedAt = new Date(session.session.createdAt).getTime();
    if (!Number.isFinite(sessionCreatedAt) || Date.now() - sessionCreatedAt > EXPORT_FRESH_WINDOW_MS) {
      return apiError(403, "REAUTH_REQUIRED", "下载账号数据前请重新登录");
    }
    const generatedAt = new Date().toISOString();
    const payload = await buildAccountExport(getDatabase(), user.id, generatedAt);
    await recordAudit(user.id, "account.exported", "user", user.id, {
      schemaVersion: payload.schemaVersion,
      resumeCount: payload.resumes.records.length,
    });
    const filenameDate = generatedAt.slice(0, 10);
    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="jianji-account-${filenameDate}.json"`,
        "cache-control": "private, no-store",
        pragma: "no-cache",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return withApiError(error);
  }
}
