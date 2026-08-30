import { ensureDatabase, getOrCreateSession, getDatabase, recordAudit, withSessionCookie } from "@/../db";
import { apiError, withApiError } from "@/lib/api";
import { mapResume, type ResumeRow } from "@/lib/db-mappers";
import { exportQuerySchema, resumeIdParamSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    await ensureDatabase();
    const session = await getOrCreateSession(request);
    const params = resumeIdParamSchema.safeParse(await context.params);
    const query = exportQuerySchema.safeParse({
      format: new URL(request.url).searchParams.get("format") ?? undefined,
    });
    if (!params.success || !query.success) return withSessionCookie(apiError(422, "VALIDATION_ERROR", "导出参数无效"), session);

    const row = await getDatabase()
      .prepare("SELECT * FROM resumes WHERE id = ? AND user_id = ? AND deleted_at IS NULL")
      .bind(params.data.id, session.userId)
      .first<ResumeRow>();
    if (!row) return withSessionCookie(apiError(404, "NOT_FOUND", "没有找到这份简历"), session);
    const resume = mapResume(row);
    const filename = sanitizeFilename(resume.title);
    await recordAudit(session.userId, "resume.exported", "resume", resume.id, { format: query.data.format }).catch(() => undefined);

    const sharedHeaders = {
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    };

    if (query.data.format === "json") {
      const portableResume = { ...resume, userId: undefined };
      return withSessionCookie(new Response(JSON.stringify({ schemaVersion: 1, resume: portableResume }, null, 2), {
        headers: {
          ...sharedHeaders,
          "content-type": "application/json; charset=utf-8",
          "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}.json`,
        },
      }), session);
    }

    return withSessionCookie(new Response(`\uFEFF${toPlainText(resume)}`, {
      headers: {
        ...sharedHeaders,
        "content-type": "text/plain; charset=utf-8",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}.txt`,
      },
    }), session);
  } catch (error) {
    return withApiError(error);
  }
}

function sanitizeFilename(value: string) {
  return value.replace(/[\uD800-\uDFFF]/g, "").replace(/[\\/:*?"<>|]/g, "-").trim() || "简历";
}

function toPlainText(resume: ReturnType<typeof mapResume>) {
  const content = resume.content;
  const lines = [
    content.basics.name,
    content.basics.headline,
    [content.basics.email, content.basics.phone, content.basics.location, content.basics.website]
      .filter(Boolean)
      .join(" | "),
    "",
    "个人简介",
    content.summary,
    "",
    "教育经历",
    ...content.education.flatMap((item) => [
      `${item.school} | ${item.degree} · ${item.major} | ${item.startDate} - ${item.endDate}`,
      item.score,
      ...item.highlights.map((line) => `- ${line}`),
    ]),
    "",
    "工作与实践",
    ...content.experience.flatMap((item) => [
      `${item.organization} | ${item.role} | ${item.startDate} - ${item.endDate}`,
      ...item.bullets.map((line) => `- ${line}`),
    ]),
    "",
    "项目经历",
    ...content.projects.flatMap((item) => [
      `${item.name} | ${item.role} | ${item.date}`,
      ...item.bullets.map((line) => `- ${line}`),
    ]),
    "",
    `技能：${content.skills.join("、")}`,
    `语言：${content.languages.join("、")}`,
    `奖项：${content.awards.join("、")}`,
  ];
  return lines.filter((line) => line !== undefined).join("\n");
}
