import { NextResponse } from "next/server";
import { ensureDatabase, getDatabase } from "@/../db";
import { requireAdminSession } from "@/lib/admin-auth";
import { withApiError } from "@/lib/api";

interface RecentRow {
  id: string;
  title: string;
  track: "study" | "career";
  target_name: string;
  progress: number;
  revision: number;
  updated_at: string;
}

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    const authorization = await requireAdminSession(request);
    if (!authorization.ok) return authorization.response;
    const role = authorization.session.user.role;
    const db = getDatabase();
    const dayStart = new Date(Math.floor(Date.now() / 86_400_000) * 86_400_000).toISOString();
    const now = new Date().toISOString();
    const [ownedMetric, templateMetric, targetMetric, modelMetric, creditMetric, recent, tracks, statuses] = await Promise.all([
      db
        .prepare(
          "SELECT COUNT(*) AS total, COALESCE(ROUND(AVG(progress)), 0) AS average FROM resumes WHERE deleted_at IS NULL",
        )
        .first<{ total: number; average: number }>(),
      db.prepare("SELECT COUNT(*) AS total FROM templates WHERE active = 1").first<{ total: number }>(),
      db.prepare("SELECT COUNT(*) AS total FROM target_profiles WHERE active = 1").first<{ total: number }>(),
      db.prepare(`SELECT
          COALESCE(SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END), 0) AS runs,
          COALESCE(SUM(estimated_cost_micros), 0) AS cost
        FROM model_run_costs WHERE created_at >= ?`)
        .bind(dayStart)
        .first<{ runs: number; cost: number }>(),
      db.prepare(`SELECT COALESCE(SUM(remaining_credits), 0) AS total FROM ai_credit_lots
        WHERE remaining_credits > 0 AND (expires_at IS NULL OR expires_at > ?)`)
        .bind(now)
        .first<{ total: number }>(),
      db
        .prepare("SELECT id, title, track, target_name, progress, revision, updated_at FROM resumes WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 6")
        .all<RecentRow>(),
      db
        .prepare("SELECT track AS label, COUNT(*) AS value FROM resumes WHERE deleted_at IS NULL GROUP BY track")
        .all<{ label: string; value: number }>(),
      db
        .prepare("SELECT status AS label, COUNT(*) AS value FROM resumes WHERE deleted_at IS NULL GROUP BY status")
        .all<{ label: string; value: number }>(),
    ]);
    const response = NextResponse.json({
      metrics: {
        totalResumes: Number(ownedMetric?.total ?? 0),
        activeTemplates: Number(templateMetric?.total ?? 0),
        targetProfiles: Number(targetMetric?.total ?? 0),
        averageProgress: Number(ownedMetric?.average ?? 0),
        modelRunsToday: Number(modelMetric?.runs ?? 0),
        estimatedModelCostTodayYuan: Number(modelMetric?.cost ?? 0) / 1_000_000,
        outstandingAiCredits: Number(creditMetric?.total ?? 0),
      },
      recentResumes: recent.results.map((row) => ({
        id: row.id,
        title: row.title,
        track: row.track,
        targetName: row.target_name,
        progress: row.progress,
        revision: row.revision,
        updatedAt: row.updated_at,
      })),
      trackBreakdown: tracks.results,
      statusBreakdown: statuses.results,
      currentAdmin: { role, mode: "authenticated-admin" },
    });
    response.headers.set("cache-control", "private, no-store");
    return response;
  } catch (error) {
    return withApiError(error);
  }
}
