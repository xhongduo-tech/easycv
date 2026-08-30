import { NextResponse } from "next/server";
import { ensureDatabase, getDatabase } from "@/../db";
import { apiError, withApiError } from "@/lib/api";
import { mapTarget, mapTemplate, type TargetRow, type TemplateRow } from "@/lib/db-mappers";
import { recommendedTemplateIdsFor } from "@/lib/target-catalog";
import { templateListQuerySchema } from "@/lib/validation";

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    const url = new URL(request.url);
    const parsed = templateListQuerySchema.safeParse({
      track: url.searchParams.get("track") ?? undefined,
      targetProfileId: url.searchParams.get("targetProfileId") ?? undefined,
    });
    if (!parsed.success) return apiError(422, "VALIDATION_ERROR", "筛选参数无效");

    const db = getDatabase();
    const target = parsed.data.targetProfileId
      ? await db
          .prepare("SELECT * FROM target_profiles WHERE id = ? AND active = 1")
          .bind(parsed.data.targetProfileId)
          .first<TargetRow>()
      : null;
    if (parsed.data.targetProfileId && !target) return apiError(404, "NOT_FOUND", "未找到目标适配方案");
    if (target && parsed.data.track && target.track !== parsed.data.track) {
      return apiError(422, "VALIDATION_ERROR", "目标与模板赛道不匹配");
    }
    const effectiveTrack = parsed.data.track ?? target?.track;
    const result = effectiveTrack
      ? await db
          .prepare("SELECT * FROM templates WHERE active = 1 AND (track = ? OR track = 'all') ORDER BY name")
          .bind(effectiveTrack)
          .all<TemplateRow>()
      : await db.prepare("SELECT * FROM templates WHERE active = 1 ORDER BY track, name").all<TemplateRow>();

    const recommendedTemplateIds = target ? recommendedTemplateIdsFor(mapTarget(target)) : [];
    const templates = result.results.map(mapTemplate).sort((a, b) => {
      const aIndex = recommendedTemplateIds.indexOf(a.id);
      const bIndex = recommendedTemplateIds.indexOf(b.id);
      if (aIndex === -1 && bIndex === -1) return a.name.localeCompare(b.name, "zh-CN");
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
    return NextResponse.json({ templates, recommendedTemplateIds });
  } catch (error) {
    return withApiError(error);
  }
}
