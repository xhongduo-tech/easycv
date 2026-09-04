import { ensureDatabase, getExistingSession, getDatabase, recordAudit, withSessionCookie } from "@/../db";
import { apiError, withApiError } from "@/lib/api";
import { mapResume, mapTemplate, type ResumeRow, type TemplateRow } from "@/lib/db-mappers";
import { safeFilename, toPlainText, toPortableResumeJson } from "@/lib/resume-document";
import { toStandaloneHtml } from "@/lib/web-resume";
import { exportQuerySchema, resumeIdParamSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const params = resumeIdParamSchema.safeParse(await context.params);
    const searchParams = new URL(request.url).searchParams;
    const query = exportQuerySchema.safeParse({
      format: searchParams.get("format") ?? undefined,
      includeContact: searchParams.get("includeContact") ?? undefined,
    });
    if (!params.success || !query.success) return apiError(422, "VALIDATION_ERROR", "导出参数无效");
    await ensureDatabase();
    const session = await getExistingSession(request);
    if (!session) return apiError(401, "UNAUTHORIZED", "请先打开属于你的简历空间");

    const row = await getDatabase()
      .prepare("SELECT * FROM resumes WHERE id = ? AND user_id = ? AND deleted_at IS NULL")
      .bind(params.data.id, session.userId)
      .first<ResumeRow>();
    if (!row) return withSessionCookie(apiError(404, "NOT_FOUND", "没有找到这份简历"), session);
    const resume = mapResume(row);
    const filename = safeFilename(resume.title);
    await recordAudit(session.userId, "resume.exported", "resume", resume.id, { format: query.data.format }).catch(() => undefined);

    const sharedHeaders = {
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    };

    if (query.data.format === "json") {
      return withSessionCookie(new Response(toPortableResumeJson(resume), {
        headers: {
          ...sharedHeaders,
          "content-type": "application/json; charset=utf-8",
          "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}.json`,
        },
      }), session);
    }

    if (query.data.format === "github-pages") {
      const template = await getDatabase()
        .prepare("SELECT * FROM templates WHERE id = ? AND active = 1")
        .bind(resume.templateId)
        .first<TemplateRow>();
      const mappedTemplate = template ? mapTemplate(template) : undefined;
      return withSessionCookie(new Response(toStandaloneHtml(resume, {
        includeContact: query.data.includeContact,
        template: mappedTemplate,
      }), {
        headers: {
          ...sharedHeaders,
          "content-type": "text/html; charset=utf-8",
          "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
          "content-disposition": "attachment; filename=\"index.html\"",
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
