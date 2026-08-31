import { NextResponse } from "next/server";
import { ensureDatabase, getDatabase, getExistingSession, recordAudit, withSessionCookie } from "@/../db";
import { apiError, parseRequest, rejectCrossOrigin, withApiError } from "@/lib/api";
import { mapTargetBrief, type ResumeRow, type TargetBriefRow } from "@/lib/db-mappers";
import { deleteTargetBriefSchema, putTargetBriefSchema, resumeIdParamSchema } from "@/lib/validation";

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
    const resume = await getOwnedResume(params.data.id, session.userId);
    if (!resume) return withSessionCookie(apiError(404, "NOT_FOUND", "没有找到这份简历"), session);
    const row = await getDatabase()
      .prepare("SELECT * FROM resume_target_briefs WHERE resume_id = ? AND user_id = ?")
      .bind(resume.id, session.userId)
      .first<TargetBriefRow>();
    return withSessionCookie(NextResponse.json({ targetBrief: row ? mapTargetBrief(row) : null }), session);
  } catch (error) {
    return withApiError(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const originError = rejectCrossOrigin(request);
    if (originError) return originError;
    const params = resumeIdParamSchema.safeParse(await context.params);
    if (!params.success) return apiError(422, "VALIDATION_ERROR", "简历 ID 无效");
    const parsed = await parseRequest(request, putTargetBriefSchema);
    if (!parsed.ok) return parsed.response;
    await ensureDatabase();
    const session = await getExistingSession(request);
    if (!session) return apiError(401, "UNAUTHORIZED", "请先打开属于你的简历空间");
    const resume = await getOwnedResume(params.data.id, session.userId);
    if (!resume) return withSessionCookie(apiError(404, "NOT_FOUND", "没有找到这份简历"), session);

    const db = getDatabase();
    const current = await db
      .prepare("SELECT * FROM resume_target_briefs WHERE resume_id = ? AND user_id = ?")
      .bind(resume.id, session.userId)
      .first<TargetBriefRow>();
    const currentRevision = current?.revision ?? 0;
    if (parsed.data.expectedRevision !== currentRevision) {
      return withSessionCookie(apiError(409, "CONFLICT", "岗位依据已在另一页面更新，请刷新后重试", {
        currentRevision,
      }), session);
    }

    const now = new Date().toISOString();
    const sourceUrl = parsed.data.sourceUrl?.trim() || null;
    let row: TargetBriefRow | null;
    if (!current) {
      row = await db.prepare(`INSERT INTO resume_target_briefs
        (resume_id, user_id, kind, focus_name, requirements_text, source_type, source_url, captured_at, revision, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(resume_id) DO NOTHING
        RETURNING *`)
        .bind(
          resume.id,
          session.userId,
          resume.track === "career" ? "career-job" : "study-program",
          parsed.data.focusName,
          parsed.data.requirementsText,
          parsed.data.sourceType,
          sourceUrl,
          now,
          now,
          now,
        )
        .first<TargetBriefRow>();
    } else {
      row = await db.prepare(`UPDATE resume_target_briefs SET
        focus_name = ?, requirements_text = ?, source_type = ?, source_url = ?, captured_at = ?,
        revision = revision + 1, updated_at = ?
        WHERE resume_id = ? AND user_id = ? AND revision = ?
        RETURNING *`)
        .bind(
          parsed.data.focusName,
          parsed.data.requirementsText,
          parsed.data.sourceType,
          sourceUrl,
          now,
          now,
          resume.id,
          session.userId,
          current.revision,
        )
        .first<TargetBriefRow>();
    }
    if (!row) {
      const latest = await db
        .prepare("SELECT revision FROM resume_target_briefs WHERE resume_id = ? AND user_id = ?")
        .bind(resume.id, session.userId)
        .first<{ revision: number }>();
      return withSessionCookie(apiError(409, "CONFLICT", "岗位依据刚刚被更新，请刷新后重试", {
        currentRevision: latest?.revision ?? 0,
      }), session);
    }
    await recordAudit(session.userId, "target-brief.updated", "resume", resume.id, { revision: row.revision }).catch(() => undefined);
    return withSessionCookie(NextResponse.json({ targetBrief: mapTargetBrief(row) }), session);
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
    const parsed = await parseRequest(request, deleteTargetBriefSchema);
    if (!parsed.ok) return parsed.response;
    await ensureDatabase();
    const session = await getExistingSession(request);
    if (!session) return apiError(401, "UNAUTHORIZED", "请先打开属于你的简历空间");
    const resume = await getOwnedResume(params.data.id, session.userId);
    if (!resume) return withSessionCookie(apiError(404, "NOT_FOUND", "没有找到这份简历"), session);
    const result = await getDatabase()
      .prepare("DELETE FROM resume_target_briefs WHERE resume_id = ? AND user_id = ? AND revision = ?")
      .bind(resume.id, session.userId, parsed.data.expectedRevision)
      .run();
    if (!result.meta.changes) {
      const current = await getDatabase()
        .prepare("SELECT revision FROM resume_target_briefs WHERE resume_id = ? AND user_id = ?")
        .bind(resume.id, session.userId)
        .first<{ revision: number }>();
      return withSessionCookie(current
        ? apiError(409, "CONFLICT", "岗位依据已在另一页面更新，请刷新后重试", { currentRevision: current.revision })
        : apiError(404, "NOT_FOUND", "没有找到岗位依据"), session);
    }
    await recordAudit(session.userId, "target-brief.deleted", "resume", resume.id).catch(() => undefined);
    return withSessionCookie(new NextResponse(null, { status: 204 }), session);
  } catch (error) {
    return withApiError(error);
  }
}
