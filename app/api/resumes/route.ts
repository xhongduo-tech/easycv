import { NextResponse } from "next/server";
import { ensureDatabase, getOrCreateSession, getDatabase, recordAudit, withSessionCookie } from "@/../db";
import { apiError, parseRequest, rejectCrossOrigin, withApiError } from "@/lib/api";
import { mapResume, mapResumeSummary, mapTargetBrief, type ResumeRow, type ResumeSummaryRow, type TargetBriefRow, type TargetRow } from "@/lib/db-mappers";
import { createBlankContent } from "@/lib/sample-data";
import { calculateProgress } from "@/lib/utils";
import { createResumeSchema, resumeListQuerySchema } from "@/lib/validation";
import { limitsForSession, ResumeLimitError } from "@/lib/resume-policy";
import { createResumeFilterHash, decodeResumeCursor, encodeResumeCursor } from "@/lib/resume-pagination";

export async function GET(request: Request) {
  try {
    await ensureDatabase();
    const session = await getOrCreateSession(request);
    const url = new URL(request.url);
    const parsed = resumeListQuerySchema.safeParse({
      track: url.searchParams.get("track") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
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
    if (parsed.data.q) {
      const escaped = parsed.data.q.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
      filters.push("(title LIKE ? ESCAPE '\\' COLLATE NOCASE OR target_name LIKE ? ESCAPE '\\' COLLATE NOCASE)");
      values.push(`%${escaped}%`, `%${escaped}%`);
    }
    const filterHash = await createResumeFilterHash(parsed.data);
    if (parsed.data.cursor) {
      const cursor = decodeResumeCursor(parsed.data.cursor, filterHash);
      if (!cursor) return withSessionCookie(apiError(422, "VALIDATION_ERROR", "分页游标无效或与当前筛选不匹配"), session);
      filters.push("(updated_at < ? OR (updated_at = ? AND id < ?))");
      values.push(cursor.updatedAt, cursor.updatedAt, cursor.id);
    }
    values.push(parsed.data.limit + 1);
    const result = await getDatabase()
      .prepare(`SELECT id, title, track, target_profile_id, target_name, template_id,
          status, progress, revision, created_at, updated_at
        FROM resumes WHERE ${filters.join(" AND ")}
        ORDER BY updated_at DESC, id DESC LIMIT ?`)
      .bind(...values)
      .all<ResumeSummaryRow>();
    const page = result.results.slice(0, parsed.data.limit);
    const last = page.at(-1);
    const nextCursor = result.results.length > parsed.data.limit && last
      ? encodeResumeCursor({ updatedAt: last.updated_at, id: last.id, filterHash })
      : null;
    return withSessionCookie(NextResponse.json({
      resumes: page.map(mapResumeSummary),
      nextCursor,
    }), session);
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
    const limits = limitsForSession(session);
    const createStatements = [
      db
        .prepare(`INSERT INTO resumes
          (id, user_id, title, track, target_profile_id, target_name, template_id, status, progress, revision, schema_version, content_json, created_at, updated_at)
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?
          WHERE (SELECT COUNT(*) FROM resumes WHERE user_id = ? AND deleted_at IS NULL) < ?
            AND (SELECT COUNT(*) FROM resumes WHERE user_id = ?) < ?
          RETURNING *`)
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
          session.userId,
          limits.active,
          session.userId,
          limits.total,
        ),
      db
        .prepare(`INSERT INTO resume_versions (id, resume_id, revision, content_json, created_at)
          SELECT ?, id, revision, content_json, ? FROM resumes
          WHERE id = ? AND user_id = ?`)
        .bind(crypto.randomUUID(), now, id, session.userId),
    ];
    if (input.targetBrief) {
      createStatements.push(db.prepare(`INSERT INTO resume_target_briefs
        (resume_id, user_id, kind, focus_name, requirements_text, source_type, source_url, captured_at, revision, created_at, updated_at)
        SELECT id, ?, ?, ?, ?, ?, ?, ?, 1, ?, ? FROM resumes
        WHERE id = ? AND user_id = ?`)
        .bind(
          session.userId,
          input.track === "career" ? "career-job" : "study-program",
          input.targetBrief.focusName,
          input.targetBrief.requirementsText,
          input.targetBrief.sourceType,
          input.targetBrief.sourceUrl || null,
          now,
          now,
          now,
          id,
          session.userId,
        ));
    }
    const results = await db.batch<ResumeRow>(createStatements);
    const row = results[0]?.results[0];
    if (!row) throw new ResumeLimitError();
    if (Number(results[1]?.meta.changes ?? 0) !== 1) {
      throw new Error("Initial resume revision was not written");
    }
    await recordAudit(session.userId, "resume.created", "resume", id, { track: input.track }).catch(() => undefined);
    const brief = input.targetBrief
      ? await db.prepare("SELECT * FROM resume_target_briefs WHERE resume_id = ? AND user_id = ?")
          .bind(id, session.userId)
          .first<TargetBriefRow>()
      : null;
    return withSessionCookie(NextResponse.json({
      resume: { ...mapResume(row), ...(brief ? { targetBrief: mapTargetBrief(brief) } : {}) },
    }, { status: 201 }), session);
  } catch (error) {
    return withApiError(error);
  }
}
