import { NextResponse } from "next/server";
import { ensureDatabase, getDatabase } from "@/../db";
import { apiError, withApiError } from "@/lib/api";
import { mapTarget, type TargetRow } from "@/lib/db-mappers";
import { trackSchema } from "@/lib/validation";

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    const trackValue = new URL(request.url).searchParams.get("track");
    const track = trackValue ? trackSchema.safeParse(trackValue) : null;
    if (track && !track.success) return apiError(422, "VALIDATION_ERROR", "赛道参数无效");

    const db = getDatabase();
    const result = track?.success
      ? await db
          .prepare("SELECT * FROM target_profiles WHERE active = 1 AND track = ? ORDER BY category, name")
          .bind(track.data)
          .all<TargetRow>()
      : await db
          .prepare("SELECT * FROM target_profiles WHERE active = 1 ORDER BY track, category, name")
          .all<TargetRow>();
    return NextResponse.json({ targets: result.results.map(mapTarget) });
  } catch (error) {
    return withApiError(error);
  }
}
