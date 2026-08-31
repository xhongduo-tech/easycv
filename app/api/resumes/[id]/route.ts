import { NextResponse } from "next/server";
import { ensureDatabase, getExistingSession, getDatabase, recordAudit, withSessionCookie } from "@/../db";
import { apiError, parseRequest, rejectCrossOrigin, withApiError } from "@/lib/api";
import { mapResume, mapTargetBrief, type ResumeRow, type TargetBriefRow, type TargetRow } from "@/lib/db-mappers";
import { calculateProgress } from "@/lib/utils";
import { resumeIdParamSchema, updateResumeSchema } from "@/lib/validation";
import { writeResumeRevision } from "@/lib/resume-store";

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
    const session = await getExistingSession(request);
    if (!session) return apiError(401, "UNAUTHORIZED", "请先打开属于你的简历空间");
    const params = resumeIdParamSchema.safeParse(await context.params);
    if (!params.success) return withSessionCookie(apiError(422, "VALIDATION_ERROR", "简历 ID 无效"), session);
    const row = await getOwnedResume(params.data.id, session.userId);
    if (!row) return withSessionCookie(apiError(404, "NOT_FOUND", "没有找到这份简历"), session);
    const brief = await getDatabase()
      .prepare("SELECT * FROM resume_target_briefs WHERE resume_id = ? AND user_id = ?")
      .bind(row.id, session.userId)
      .first<TargetBriefRow>();
    return withSessionCookie(NextResponse.json({
      resume: { ...mapResume(row), ...(brief ? { targetBrief: mapTargetBrief(brief) } : {}) },
    }), session);
  } catch (error) {
    return withApiError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const originError = rejectCrossOrigin(request);
    if (originError) return originError;
    const params = resumeIdParamSchema.safeParse(await context.params);
    if (!params.success) return apiError(422, "VALIDATION_ERROR", "简历 ID 无效");
    const parsed = await parseRequest(request, updateResumeSchema);
    if (!parsed.ok) return parsed.response;
    await ensureDatabase();
    const session = await getExistingSession(request);
    if (!session) return apiError(401, "UNAUTHORIZED", "请先打开属于你的简历空间");
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
    if (effectiveTrack !== current.track) {
      const brief = await db
        .prepare("SELECT resume_id FROM resume_target_briefs WHERE resume_id = ? AND user_id = ?")
        .bind(current.id, session.userId)
        .first<{ resume_id: string }>();
      if (brief) {
        return withSessionCookie(apiError(422, "VALIDATION_ERROR", "切换简历用途前，请先清除当前岗位或项目依据"), session);
      }
    }
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

    const now = new Date().toISOString();
    const contentJson = JSON.stringify(content);
    const nextTitle = parsed.data.title ?? current.title;
    const nextStatus = parsed.data.status ?? current.status;
    const nextProgress = calculateProgress(content);
    const unchanged = nextTitle === current.title
      && effectiveTrack === current.track
      && targetProfileId === current.target_profile_id
      && targetName === current.target_name
      && templateId === current.template_id
      && nextStatus === current.status
      && nextProgress === current.progress
      && contentJson === current.content_json;
    if (unchanged) {
      return withSessionCookie(NextResponse.json({ resume: mapResume(current) }), session);
    }
    const updated = await writeResumeRevision(db, {
      id: current.id,
      userId: session.userId,
      expectedRevision: current.revision,
      title: nextTitle,
      track: effectiveTrack,
      targetProfileId,
      targetName,
      templateId,
      status: nextStatus,
      progress: nextProgress,
      contentJson,
      deletedAt: null,
      now,
    });
    if (!updated) {
      return withSessionCookie(apiError(409, "CONFLICT", "这份简历刚刚被更新，请刷新后重试"), session);
    }
    await recordAudit(session.userId, "resume.updated", "resume", current.id, { revision: updated.revision }).catch(() => undefined);
    return withSessionCookie(NextResponse.json({ resume: mapResume(updated) }), session);
  } catch (error) {
    return withApiError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const originError = rejectCrossOrigin(request);
    if (originError) return originError;
    const params = resumeIdParamSchema.safeParse(await context.params);
    if (!params.success) return apiError(422, "VALIDATION_ERROR", "简历 ID 无效");
    await ensureDatabase();
    const session = await getExistingSession(request);
    if (!session) return apiError(401, "UNAUTHORIZED", "请先打开属于你的简历空间");
    const current = await getOwnedResume(params.data.id, session.userId);
    if (!current) return withSessionCookie(apiError(404, "NOT_FOUND", "没有找到这份简历"), session);
    const now = new Date().toISOString();
    const updated = await writeResumeRevision(getDatabase(), {
      id: current.id,
      userId: session.userId,
      expectedRevision: current.revision,
      title: current.title,
      track: current.track,
      targetProfileId: current.target_profile_id,
      targetName: current.target_name,
      templateId: current.template_id,
      status: "archived",
      progress: current.progress,
      contentJson: current.content_json,
      deletedAt: now,
      now,
    });
    if (!updated) return withSessionCookie(apiError(409, "CONFLICT", "归档前简历已被更新，请重试"), session);
    await recordAudit(session.userId, "resume.archived", "resume", current.id).catch(() => undefined);
    return withSessionCookie(new NextResponse(null, { status: 204 }), session);
  } catch (error) {
    return withApiError(error);
  }
}
