import { NextResponse } from "next/server";
import type { ZodError, ZodType } from "zod";
import { SessionRateLimitError } from "@/../db";
import { formatValidationIssues } from "@/lib/validation";

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "FORBIDDEN"
  | "RATE_LIMITED"
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
  if (error instanceof SessionRateLimitError) {
    return apiError(429, "RATE_LIMITED", "新建访客空间过于频繁，请稍后再试");
  }
  console.error("API request failed", error instanceof Error ? error.message : "Unknown error");
  return apiError(500, "INTERNAL_ERROR", "服务暂时不可用，请稍后重试");
}
