import { NextResponse } from "next/server";
import type { ZodError, ZodType } from "zod";
import { SessionRateLimitError } from "@/../db";
import { LegalAcceptanceRequiredError } from "@/lib/legal-acceptance";
import { ResumeLimitError } from "@/lib/resume-policy";
import { MfaVerificationRequiredError } from "@/lib/session-assurance";
import { AiCreditSettlementUncertainError } from "@/lib/credits";
import { AccountExportTooLargeError } from "@/lib/account-export";
import { logOperationalEvent } from "@/lib/operational-log";
import { formatValidationIssues } from "@/lib/validation";

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "FORBIDDEN"
  | "RATE_LIMITED"
  | "MODEL_REQUEST_ACTIVE"
  | "IDEMPOTENCY_IN_PROGRESS"
  | "IDEMPOTENCY_CONFLICT"
  | "IDEMPOTENCY_EXPIRED"
  | "MFA_REQUIRED"
  | "REAUTH_REQUIRED"
  | "LEGAL_ACCEPTANCE_REQUIRED"
  | "RESOURCE_LIMIT_REACHED"
  | "SERVICE_DISABLED"
  | "SETTLEMENT_PENDING"
  | "PAYLOAD_TOO_LARGE"
  | "INTERNAL_ERROR";

export function apiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: unknown,
) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        ...(details ? { details } : {}),
      },
    },
    { status },
  );
}

export async function parseRequest<T>(request: Request, schema: ZodType<T>) {
  let body: unknown;
  try {
    const declaredSize = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(declaredSize) && declaredSize > 600_000) {
      return { ok: false as const, response: apiError(413, "PAYLOAD_TOO_LARGE", "简历内容过大，请精简后重试") };
    }
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 600_000) {
      return { ok: false as const, response: apiError(413, "PAYLOAD_TOO_LARGE", "简历内容过大，请精简后重试") };
    }
    body = JSON.parse(raw);
  } catch {
    return { ok: false as const, response: apiError(400, "VALIDATION_ERROR", "请求体必须是 JSON") };
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    return {
      ok: false as const,
      response: apiError(
        422,
        "VALIDATION_ERROR",
        "提交内容需要调整",
        formatValidationIssues(result.error as ZodError),
      ),
    };
  }
  return { ok: true as const, data: result.data };
}

export function rejectCrossOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return apiError(403, "FORBIDDEN", "跨站请求已被拒绝");
  }
  return null;
}

export function withApiError(error: unknown) {
  if (error instanceof AccountExportTooLargeError) {
    return apiError(
      413,
      "PAYLOAD_TOO_LARGE",
      "账户数据量较大，暂时无法同步导出；请删除不再需要的简历后重试，或联系支持协助导出",
    );
  }
  if (error instanceof SessionRateLimitError) {
    return apiError(429, "RATE_LIMITED", "新建访客空间过于频繁，请稍后再试");
  }
  if (error instanceof LegalAcceptanceRequiredError) {
    return apiError(428, "LEGAL_ACCEPTANCE_REQUIRED", "请先确认最新用户协议与隐私说明");
  }
  if (error instanceof ResumeLimitError) {
    return apiError(409, "RESOURCE_LIMIT_REACHED", "简历数量已达到当前账号上限，请先整理已有简历");
  }
  if (error instanceof MfaVerificationRequiredError) {
    return apiError(403, "MFA_REQUIRED", "请先完成当前会话的双重验证");
  }
  if (error instanceof AiCreditSettlementUncertainError) {
    logOperationalEvent("warn", "ai.settlement_pending", {
      errorName: error.name,
    });
    const response = apiError(503, "SETTLEMENT_PENDING", "增强结果正在核对中，请使用同一请求稍后重试");
    response.headers.set("retry-after", "2");
    return response;
  }
  logOperationalEvent("error", "api.unhandled_error", {
    errorName: error instanceof Error ? error.name : "UnknownError",
  });
  return apiError(500, "INTERNAL_ERROR", "服务暂时不可用，请稍后重试");
}
