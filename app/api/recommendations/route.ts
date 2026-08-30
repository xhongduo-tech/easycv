import { NextResponse } from "next/server";
import { ensureDatabase, getOrCreateSession, getDatabase, withSessionCookie } from "@/../db";
import { createAdvice } from "@/lib/advisor";
import { apiError, parseRequest, rejectCrossOrigin, withApiError } from "@/lib/api";
import { mapResume, mapTarget, type ResumeRow, type TargetRow } from "@/lib/db-mappers";
import { recommendationRequestSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const originError = rejectCrossOrigin(request);
    if (originError) return originError;
    await ensureDatabase();
    const session = await getOrCreateSession(request);
    const parsed = await parseRequest(request, recommendationRequestSchema);
    if (!parsed.ok) return withSessionCookie(parsed.response, session);
    const db = getDatabase();
    let content = parsed.data.content;
    let track = parsed.data.track;
    let targetProfileId = parsed.data.targetProfileId ?? parsed.data.targetId;

    if (parsed.data.resumeId) {
      const row = await db
        .prepare("SELECT * FROM resumes WHERE id = ? AND user_id = ? AND deleted_at IS NULL")
        .bind(parsed.data.resumeId, session.userId)
        .first<ResumeRow>();
      if (!row) return withSessionCookie(apiError(404, "NOT_FOUND", "没有找到这份简历"), session);
      const resume = mapResume(row);
      content ??= resume.content;
      track = resume.track;
      targetProfileId ??= resume.targetProfileId;
    }
    if (!content || !track) return withSessionCookie(apiError(422, "VALIDATION_ERROR", "缺少可分析的简历内容"), session);

    const targetRow = targetProfileId
      ? await db
          .prepare("SELECT * FROM target_profiles WHERE id = ? AND track = ? AND active = 1")
          .bind(targetProfileId, track)
          .first<TargetRow>()
      : null;
    if (targetProfileId && !targetRow) {
      return withSessionCookie(apiError(404, "NOT_FOUND", "未找到与赛道匹配的目标画像"), session);
    }
    const result = createAdvice(content, track, targetRow ? mapTarget(targetRow) : undefined, parsed.data.section);
    await db
      .prepare(`INSERT INTO suggestion_events
        (id, resume_id, target_profile_id, section, score, provider, created_at)
        VALUES (?, ?, ?, ?, ?, 'local-rules', ?)`)
      .bind(
        crypto.randomUUID(),
        parsed.data.resumeId ?? null,
        targetProfileId ?? null,
        parsed.data.section,
        result.score,
        new Date().toISOString(),
      )
      .run();
    return withSessionCookie(NextResponse.json({ ...result, provider: "local-rules", factPolicy: "建议不会自动改写或虚构经历" }), session);
  } catch (error) {
    return withApiError(error);
  }
}
