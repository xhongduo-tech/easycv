import { NextResponse } from "next/server";
import { ensureDatabase, getDatabase } from "@/../db";
import { auth } from "@/lib/auth";
import { apiError, withApiError } from "@/lib/api";

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
    const session = await auth.api.getSession({ headers: request.headers });
    const role = (session?.user as (NonNullable<typeof session>["user"] & { role?: string }) | undefined)?.role;
    if (!session?.user) return apiError(401, "UNAUTHORIZED", "请先登录管理员账号");
    if (role !== "admin") return apiError(403, "FORBIDDEN", "当前账号没有管理权限");
    const db = getDatabase();
    const [ownedMetric, templateMetric, targetMetric, recent, tracks, statuses] = await Promise.all([
      db
        .prepare(
          "SELECT COUNT(*) AS total, COALESCE(ROUND(AVG(progress)), 0) AS average FROM resumes WHERE deleted_at IS NULL",
        )
        .first<{ total: number; average: number }>(),
      db.prepare("SELECT COUNT(*) AS total FROM templates WHERE active = 1").first<{ total: number }>(),
      db.prepare("SELECT COUNT(*) AS total FROM target_profiles WHERE active = 1").first<{ total: number }>(),
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
    return NextResponse.json({
      metrics: {
        totalResumes: Number(ownedMetric?.total ?? 0),
        activeTemplates: Number(templateMetric?.total ?? 0),
        targetProfiles: Number(targetMetric?.total ?? 0),
        averageProgress: Number(ownedMetric?.average ?? 0),
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
  } catch (error) {
    return withApiError(error);
  }
}
