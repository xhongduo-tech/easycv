import { NextResponse } from "next/server";
import { ensureDatabase, getDatabase } from "@/../db";
import { apiError, withApiError } from "@/lib/api";
import { mapTarget, type TargetRow } from "@/lib/db-mappers";
import { targetCatalogGroups } from "@/lib/target-catalog";
import { targetListQuerySchema } from "@/lib/validation";

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    const url = new URL(request.url);
    const parsed = targetListQuerySchema.safeParse({
      track: url.searchParams.get("track") ?? undefined,
      group: url.searchParams.get("group") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
    });
    if (!parsed.success) return apiError(422, "VALIDATION_ERROR", "目标目录参数无效");

    const db = getDatabase();
    const result = parsed.data.track
      ? await db
          .prepare("SELECT * FROM target_profiles WHERE active = 1 AND track = ? ORDER BY category, name")
          .bind(parsed.data.track)
          .all<TargetRow>()
      : await db
          .prepare("SELECT * FROM target_profiles WHERE active = 1 ORDER BY track, category, name")
          .all<TargetRow>();
    const allTargets = result.results.map(mapTarget);
    const normalizedQuery = parsed.data.q?.trim().toLowerCase();
    const targets = allTargets.filter((target) => {
      const group = target.track === "study" ? target.region : target.category;
      const groupMatches = !parsed.data.group || group === parsed.data.group;
      const queryMatches = !normalizedQuery || [target.id, target.name, target.category, target.region]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
      return groupMatches && queryMatches;
    });
    const groups = parsed.data.track
      ? targetCatalogGroups[parsed.data.track].map((group) => ({
          ...group,
          count: allTargets.filter((target) =>
            (target.track === "study" ? target.region : target.category) === group.key,
          ).length,
        }))
      : [];
    return NextResponse.json({ targets, groups, total: allTargets.length });
  } catch (error) {
    return withApiError(error);
  }
}
