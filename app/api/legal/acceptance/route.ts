import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { ensureDatabase, getDatabase, recordAudit } from "@/../db";
import { apiError, parseRequest, rejectCrossOrigin, withApiError } from "@/lib/api";
import {
  CURRENT_LEGAL_DOCUMENTS,
  hasCurrentLegalAcceptance,
  recordCurrentLegalAcceptance,
} from "@/lib/legal-acceptance";

const acceptanceSchema = z.object({
  termsVersion: z.literal(CURRENT_LEGAL_DOCUMENTS.termsVersion),
  privacyVersion: z.literal(CURRENT_LEGAL_DOCUMENTS.privacyVersion),
  acceptTerms: z.literal(true),
  acknowledgePrivacy: z.literal(true),
}).strict();

async function getAuthenticatedSession(request: Request) {
  return auth.api.getSession({
    headers: request.headers,
    query: { disableCookieCache: true, disableRefresh: true },
  });
}

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    const session = await getAuthenticatedSession(request);
    if (!session?.user) return apiError(401, "UNAUTHORIZED", "请先登录");
    const accepted = await hasCurrentLegalAcceptance(getDatabase(), session.user.id);
    const response = NextResponse.json({
      accepted,
      documents: CURRENT_LEGAL_DOCUMENTS,
    });
    response.headers.set("cache-control", "private, no-store");
    return response;
  } catch (error) {
    return withApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const originError = rejectCrossOrigin(request);
    if (originError) return originError;
    await ensureDatabase();
    const session = await getAuthenticatedSession(request);
    if (!session?.user) return apiError(401, "UNAUTHORIZED", "请先登录");
    if ((session.session as typeof session.session & { impersonatedBy?: string | null }).impersonatedBy) {
      return apiError(403, "FORBIDDEN", "模拟登录不能代表用户确认协议");
    }
    const parsed = await parseRequest(request, acceptanceSchema);
    if (!parsed.ok) return parsed.response;
    const acceptance = await recordCurrentLegalAcceptance(
      getDatabase(),
      session.user.id,
      new Date().toISOString(),
    );
    if (acceptance.created) {
      await recordAudit(session.user.id, "legal.accepted", "user", session.user.id, {
        termsVersion: CURRENT_LEGAL_DOCUMENTS.termsVersion,
        privacyVersion: CURRENT_LEGAL_DOCUMENTS.privacyVersion,
      });
    }
    const response = NextResponse.json({ accepted: true, acceptedAt: acceptance.acceptedAt });
    response.headers.set("cache-control", "private, no-store");
    return response;
  } catch (error) {
    return withApiError(error);
  }
}
