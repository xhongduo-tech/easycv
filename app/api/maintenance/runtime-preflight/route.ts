import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { resolveAuthRuntime } from "@/lib/auth-runtime";
import { hasValidMaintenanceCredential } from "@/lib/maintenance-auth";

export async function GET(request: Request) {
  if (!(await hasValidMaintenanceCredential(request, env.MAINTENANCE_SECRET))) {
    return NextResponse.json({ status: "error", code: "UNAUTHORIZED" }, {
      status: 401,
      headers: { "cache-control": "private, no-store" },
    });
  }

  try {
    const runtime = resolveAuthRuntime(env);
    return NextResponse.json({
      status: "ok",
      appEnvironment: runtime.appEnvironment,
      baseURL: runtime.baseURL,
      developmentCapture: runtime.developmentCapture,
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({
      status: "error",
      code: "RUNTIME_CONFIGURATION_INVALID",
      reason: error instanceof Error ? error.message : "Unknown runtime configuration error",
    }, {
      status: 503,
      headers: { "cache-control": "private, no-store" },
    });
  }
}
