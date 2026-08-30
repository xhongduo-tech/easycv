import { NextResponse } from "next/server";
import { ensureDatabase, getOrCreateSession, getDatabase, withSessionCookie } from "@/../db";
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
    const session = await getOrCreateSession(request);
    const db = getDatabase();
    const [ownedMetric, templateMetric, targetMetric, recent, tracks, statuses] = await Promise.all([
      db
        .prepare(
          "SELECT COUNT(*) AS total, COALESCE(ROUND(AVG(progress)), 0) AS average FROM resumes WHERE user_id = ? AND deleted_at IS NULL",
        )
        .bind(session.userId)
        .first<{ total: number; average: number }>(),
      db.prepare("SELECT COUNT(*) AS total FROM templates WHERE active = 1").first<{ total: number }>(),
      db.prepare("SELECT COUNT(*) AS total FROM target_profiles WHERE active = 1").first<{ total: number }>(),
      db
        .prepare("SELECT id, title, track, target_name, progress, revision, updated_at FROM resumes WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 6")
        .bind(session.userId)
        .all<RecentRow>(),
      db
        .prepare("SELECT track AS label, COUNT(*) AS value FROM resumes WHERE user_id = ? AND deleted_at IS NULL GROUP BY track")
        .bind(session.userId)
        .all<{ label: string; value: number }>(),
      db
        .prepare("SELECT status AS label, COUNT(*) AS value FROM resumes WHERE user_id = ? AND deleted_at IS NULL GROUP BY status")
        .bind(session.userId)
        .all<{ label: string; value: number }>(),
    ]);
    return withSessionCookie(NextResponse.json({
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
      currentAdmin: { role: "visitor_operator", mode: "private-session-demo" },
    }), session);
  } catch (error) {
    return withApiError(error);
  }
}
