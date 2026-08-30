import { NextResponse } from "next/server";
import { ensureDatabase, getDatabase } from "@/../db";
import { apiError, withApiError } from "@/lib/api";
import { mapTemplate, type TemplateRow } from "@/lib/db-mappers";
import { templateListQuerySchema } from "@/lib/validation";

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    const url = new URL(request.url);
    const parsed = templateListQuerySchema.safeParse({ track: url.searchParams.get("track") ?? undefined });
    if (!parsed.success) return apiError(422, "VALIDATION_ERROR", "筛选参数无效");

    const db = getDatabase();
    const result = parsed.data.track
      ? await db
          .prepare("SELECT * FROM templates WHERE active = 1 AND (track = ? OR track = 'all') ORDER BY name")
          .bind(parsed.data.track)
          .all<TemplateRow>()
      : await db.prepare("SELECT * FROM templates WHERE active = 1 ORDER BY track, name").all<TemplateRow>();

    return NextResponse.json({ templates: result.results.map(mapTemplate) });
  } catch (error) {
    return withApiError(error);
  }
}
