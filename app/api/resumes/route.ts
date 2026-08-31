import { NextResponse } from "next/server";
import { ensureDatabase, getOrCreateSession, getDatabase, recordAudit, withSessionCookie } from "@/../db";
import { apiError, parseRequest, rejectCrossOrigin, withApiError } from "@/lib/api";
import { mapResume, type ResumeRow, type TargetRow } from "@/lib/db-mappers";
import { createBlankContent } from "@/lib/sample-data";
import { calculateProgress } from "@/lib/utils";
import { createResumeSchema, resumeListQuerySchema } from "@/lib/validation";

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    const session = await getOrCreateSession(request);
    const url = new URL(request.url);
    const parsed = resumeListQuerySchema.safeParse({
      track: url.searchParams.get("track") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    if (!parsed.success) return withSessionCookie(apiError(422, "VALIDATION_ERROR", "列表参数无效"), session);

    const filters = ["user_id = ?", "deleted_at IS NULL"];
    const values: Array<string | number> = [session.userId];
    if (parsed.data.track) {
      filters.push("track = ?");
      values.push(parsed.data.track);
    }
    if (parsed.data.status) {
      filters.push("status = ?");
      values.push(parsed.data.status);
    }
    values.push(parsed.data.limit);
    const result = await getDatabase()
      .prepare(`SELECT * FROM resumes WHERE ${filters.join(" AND ")} ORDER BY updated_at DESC LIMIT ?`)
      .bind(...values)
      .all<ResumeRow>();
    return withSessionCookie(NextResponse.json({ resumes: result.results.map(mapResume) }), session);
  } catch (error) {
    return withApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const originError = rejectCrossOrigin(request);
    if (originError) return originError;
    const parsed = await parseRequest(request, createResumeSchema);
    if (!parsed.ok) return parsed.response;
    await ensureDatabase();
    const session = await getOrCreateSession(request);
    const input = parsed.data;
    const db = getDatabase();

    let targetName = input.targetName;
    if (input.targetProfileId) {
      const target = await db
        .prepare("SELECT * FROM target_profiles WHERE id = ? AND track = ? AND active = 1")
        .bind(input.targetProfileId, input.track)
        .first<TargetRow>();
      if (!target) return withSessionCookie(apiError(404, "NOT_FOUND", "未找到所选目标画像"), session);
      targetName = target.name;
    }
    if (!targetName) return withSessionCookie(apiError(422, "VALIDATION_ERROR", "请选择目标院校或企业"), session);

    let templateId = input.templateId;
    if (templateId) {
      const template = await db
        .prepare("SELECT id FROM templates WHERE id = ? AND active = 1 AND (track = ? OR track = 'all')")
        .bind(templateId, input.track)
        .first<{ id: string }>();
      if (!template) return withSessionCookie(apiError(404, "NOT_FOUND", "未找到所选模板"), session);
    } else {
      templateId = input.track === "study" ? "atlas" : "summit";
    }

    const id = crypto.randomUUID();
    const content = input.content ?? createBlankContent();
    const now = new Date().toISOString();
    const title = input.title ?? `${targetName} · ${input.track === "study" ? "申请 CV" : "求职简历"}`;
    const contentJson = JSON.stringify(content);
    const progress = calculateProgress(content);
    await db.batch([
      db
        .prepare(`INSERT INTO resumes
          (id, user_id, title, track, target_profile_id, target_name, template_id, status, progress, revision, schema_version, content_json, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?)`)
        .bind(
          id,
          session.userId,
          title,
          input.track,
          input.targetProfileId ?? null,
          targetName,
          templateId,
          input.status ?? "draft",
          progress,
          contentJson,
          now,
          now,
        ),
      db
        .prepare(`INSERT INTO resume_versions (id, resume_id, revision, content_json, created_at)
          VALUES (?, ?, 1, ?, ?)`)
        .bind(crypto.randomUUID(), id, contentJson, now),
    ]);
    await recordAudit(session.userId, "resume.created", "resume", id, { track: input.track }).catch(() => undefined);
    const row = await db
      .prepare("SELECT * FROM resumes WHERE id = ? AND user_id = ?")
      .bind(id, session.userId)
      .first<ResumeRow>();
    return withSessionCookie(NextResponse.json({ resume: mapResume(row!) }, { status: 201 }), session);
  } catch (error) {
    return withApiError(error);
  }
}
