import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { ensureDatabase, getDatabase } from "@/../db";
import { apiError, withApiError } from "@/lib/api";
import { hasValidMaintenanceCredential } from "@/lib/maintenance-auth";
import { runRetentionMaintenance } from "@/lib/retention";
import { maintainAgentJobs } from "@/lib/agent-jobs";

export async function POST(request: Request) {
  try {
    if (!(await hasValidMaintenanceCredential(request, env.MAINTENANCE_SECRET))) {
      return apiError(401, "UNAUTHORIZED", "维护凭据无效");
    }
    await ensureDatabase();
    const result = await runRetentionMaintenance(getDatabase(), { apply: true });
    const agentTasks = await maintainAgentJobs(getDatabase());
    return NextResponse.json({ status: "ok", ...result, agentTasks }, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    return withApiError(error);
  }
}
