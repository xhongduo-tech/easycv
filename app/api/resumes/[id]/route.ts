import { NextResponse } from "next/server";
import { ensureDatabase, getOrCreateSession, getDatabase, recordAudit, withSessionCookie } from "@/../db";
import { apiError, parseRequest, rejectCrossOrigin, withApiError } from "@/lib/api";
import { mapResume, type ResumeRow, type TargetRow } from "@/lib/db-mappers";
import { calculateProgress } from "@/lib/utils";
import { resumeIdParamSchema, updateResumeSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

async function getOwnedResume(id: string, userId: string) {
  return getDatabase()
    .prepare("SELECT * FROM resumes WHERE id = ? AND user_id = ? AND deleted_at IS NULL")
    .bind(id, userId)
    .first<ResumeRow>();
}

export async function GET(request: Request, context: RouteContext) {
  try {
    await ensureDatabase();
    const session = await getOrCreateSession(request);
    const params = resumeIdParamSchema.safeParse(await context.params);
    if (!params.success) return withSessionCookie(apiError(422, "VALIDATION_ERROR", "简历 ID 无效"), session);
    const row = await getOwnedResume(params.data.id, session.userId);
    if (!row) return withSessionCookie(apiError(404, "NOT_FOUND", "没有找到这份简历"), session);
    return withSessionCookie(NextResponse.json({ resume: mapResume(row) }), session);
  } catch (error) {
    return withApiError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const originError = rejectCrossOrigin(request);
    if (originError) return originError;
    await ensureDatabase();
    const session = await getOrCreateSession(request);
    const params = resumeIdParamSchema.safeParse(await context.params);
    if (!params.success) return withSessionCookie(apiError(422, "VALIDATION_ERROR", "简历 ID 无效"), session);
    const parsed = await parseRequest(request, updateResumeSchema);
    if (!parsed.ok) return withSessionCookie(parsed.response, session);
    const current = await getOwnedResume(params.data.id, session.userId);
    if (!current) return withSessionCookie(apiError(404, "NOT_FOUND", "没有找到这份简历"), session);
    if (parsed.data.expectedRevision !== current.revision) {
      return withSessionCookie(apiError(409, "CONFLICT", "这份简历已在其他页面更新，请刷新后重试", {
        currentRevision: current.revision,
      }), session);
    }

    const db = getDatabase();
    const content = parsed.data.content ?? mapResume(current).content;
    const effectiveTrack = parsed.data.track ?? current.track;
    let targetName = parsed.data.targetName ?? current.target_name;
    let targetProfileId = parsed.data.targetProfileId ?? current.target_profile_id;
    if (parsed.data.targetName && !parsed.data.targetProfileId) targetProfileId = null;
    if (parsed.data.targetProfileId) {
      const target = await db
        .prepare("SELECT * FROM target_profiles WHERE id = ? AND track = ? AND active = 1")
        .bind(parsed.data.targetProfileId, effectiveTrack)
        .first<TargetRow>();
      if (!target) return withSessionCookie(apiError(404, "NOT_FOUND", "未找到与赛道匹配的目标画像"), session);
      targetName = target.name;
    } else if (targetProfileId) {
      const compatibleTarget = await db
        .prepare("SELECT id FROM target_profiles WHERE id = ? AND track = ? AND active = 1")
        .bind(targetProfileId, effectiveTrack)
        .first<{ id: string }>();
      if (!compatibleTarget) {
        return withSessionCookie(apiError(422, "VALIDATION_ERROR", "切换赛道时请重新选择目标"), session);
      }
    }
    const templateId = parsed.data.templateId ?? current.template_id;
    const compatibleTemplate = await db
      .prepare("SELECT id FROM templates WHERE id = ? AND active = 1 AND (track = ? OR track = 'all')")
      .bind(templateId, effectiveTrack)
      .first<{ id: string }>();
    if (!compatibleTemplate) return withSessionCookie(apiError(422, "VALIDATION_ERROR", "模板与当前赛道不匹配"), session);

    const revision = current.revision + 1;
    const now = new Date().toISOString();
    const contentJson = JSON.stringify(content);
    const updated = await db
      .prepare(`UPDATE resumes SET
          title = ?, track = ?, target_profile_id = ?, target_name = ?, template_id = ?, status = ?,
          progress = ?, revision = ?, content_json = ?, updated_at = ?
          WHERE id = ? AND user_id = ? AND revision = ?
          RETURNING *`)
      .bind(
          parsed.data.title ?? current.title,
          effectiveTrack,
          targetProfileId,
          targetName,
          templateId,
          parsed.data.status ?? current.status,
          calculateProgress(content),
          revision,
          contentJson,
          now,
          current.id,
          session.userId,
          current.revision,
        )
      .first<ResumeRow>();
    if (!updated) {
      return withSessionCookie(apiError(409, "CONFLICT", "这份简历刚刚被更新，请刷新后重试"), session);
    }
    await db
      .prepare(`INSERT INTO resume_versions (id, resume_id, revision, content_json, created_at)
          VALUES (?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), current.id, revision, contentJson, now)
      .run();
    await recordAudit(session.userId, "resume.updated", "resume", current.id, { revision }).catch(() => undefined);
    return withSessionCookie(NextResponse.json({ resume: mapResume(updated) }), session);
  } catch (error) {
    return withApiError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const originError = rejectCrossOrigin(request);
    if (originError) return originError;
    await ensureDatabase();
    const session = await getOrCreateSession(request);
    const params = resumeIdParamSchema.safeParse(await context.params);
    if (!params.success) return withSessionCookie(apiError(422, "VALIDATION_ERROR", "简历 ID 无效"), session);
    const current = await getOwnedResume(params.data.id, session.userId);
    if (!current) return withSessionCookie(apiError(404, "NOT_FOUND", "没有找到这份简历"), session);
    const now = new Date().toISOString();
    const result = await getDatabase()
      .prepare(
        "UPDATE resumes SET status = 'archived', deleted_at = ?, updated_at = ?, revision = revision + 1 WHERE id = ? AND user_id = ? AND revision = ?",
      )
      .bind(now, now, current.id, session.userId, current.revision)
      .run();
    if (!result.meta.changes) return withSessionCookie(apiError(409, "CONFLICT", "归档前简历已被更新，请重试"), session);
    await recordAudit(session.userId, "resume.archived", "resume", current.id).catch(() => undefined);
    return withSessionCookie(new NextResponse(null, { status: 204 }), session);
  } catch (error) {
    return withApiError(error);
  }
}
