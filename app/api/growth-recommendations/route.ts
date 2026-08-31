import { NextResponse } from "next/server";
import { ensureDatabase, getDatabase, getExistingSession, withSessionCookie } from "@/../db";
import { apiError, parseRequest, rejectCrossOrigin, withApiError } from "@/lib/api";
import { mapResume, type ResumeRow } from "@/lib/db-mappers";
import { explainGrowthRecommendation, recommendGrowthResources } from "@/lib/growth-data";
import { growthRecommendationRequestSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const originError = rejectCrossOrigin(request);
    if (originError) return originError;
    const parsed = await parseRequest(request, growthRecommendationRequestSchema);
    if (!parsed.ok) return parsed.response;
    await ensureDatabase();
    const session = await getExistingSession(request);
    if (!session) return apiError(401, "UNAUTHORIZED", "请先创建或打开一份属于你的简历");

    const row = await getDatabase()
      .prepare("SELECT * FROM resumes WHERE id = ? AND user_id = ? AND deleted_at IS NULL")
      .bind(parsed.data.resumeId, session.userId)
      .first<ResumeRow>();
    if (!row) return withSessionCookie(apiError(404, "NOT_FOUND", "没有找到这份简历"), session);

    const resume = mapResume(row);
    const recommendations = recommendGrowthResources(resume).map((resource) => ({
      ...resource,
      reason: explainGrowthRecommendation(resume, resource),
    }));
    return withSessionCookie(NextResponse.json({
      targetName: resume.targetName,
      track: resume.track,
      recommendations,
      rationale: recommendations.map((item) => item.reason),
      policy: "建议来自目标名称、版本标签与草稿证据的规则匹配，不代表目标机构要求；建议学习也不等于已取得证书。",
    }), session);
  } catch (error) {
    return withApiError(error);
  }
}
