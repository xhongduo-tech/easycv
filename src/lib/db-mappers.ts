import type { ResumeContent, ResumeRecord, ResumeTemplate, TargetBrief, TargetProfile } from "@/types/resume";
import { withTemplateDesignMeta } from "@/lib/template-system";

export interface ResumeRow {
  id: string;
  user_id: string;
  title: string;
  track: "study" | "career";
  target_profile_id: string | null;
  target_name: string;
  template_id: string;
  status: "draft" | "ready" | "archived";
  progress: number;
  revision: number;
  content_json: string;
  created_at: string;
  updated_at: string;
}

export interface TemplateRow {
  id: string;
  name: string;
  description: string;
  track: "study" | "career" | "all";
  accent: string;
  layout: "classic" | "modern" | "compact" | "editorial";
  tags_json: string;
  recommended_for_json: string;
  active: number;
}

export interface TargetRow {
  id: string;
  track: "study" | "career";
  name: string;
  category: string;
  region: string;
  description: string;
  keywords_json: string;
  priorities_json: string;
  tone: string;
  source_type: "editorial" | "official" | "mixed";
  reviewed_at: string;
}

export interface TargetBriefRow {
  resume_id: string;
  user_id: string;
  kind: "career-job" | "study-program";
  focus_name: string;
  requirements_text: string;
  source_type: "employer-official" | "boss" | "zhaopin" | "other-platform" | "manual";
  source_url: string | null;
  captured_at: string;
  revision: number;
  created_at: string;
  updated_at: string;
}

export function mapResume(row: ResumeRow): ResumeRecord {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    track: row.track,
    ...(row.target_profile_id ? { targetProfileId: row.target_profile_id } : {}),
    targetName: row.target_name,
    templateId: row.template_id,
    status: row.status,
    progress: row.progress,
    revision: row.revision,
    content: JSON.parse(row.content_json) as ResumeContent,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapTemplate(row: TemplateRow): ResumeTemplate {
  return withTemplateDesignMeta({
    id: row.id,
    name: row.name,
    description: row.description,
    track: row.track,
    accent: row.accent,
    layout: row.layout,
    tags: JSON.parse(row.tags_json) as string[],
    active: Boolean(row.active),
    recommendedFor: JSON.parse(row.recommended_for_json) as string[],
  });
}

export function mapTarget(row: TargetRow): TargetProfile {
  return {
    id: row.id,
    track: row.track,
    name: row.name,
    category: row.category,
    region: row.region,
    description: row.description,
    keywords: JSON.parse(row.keywords_json) as string[],
    priorities: JSON.parse(row.priorities_json) as string[],
    tone: row.tone,
    sourceType: row.source_type,
    reviewedAt: row.reviewed_at,
  };
}

export function mapTargetBrief(row: TargetBriefRow): TargetBrief {
  return {
    resumeId: row.resume_id,
    kind: row.kind,
    focusName: row.focus_name,
    requirementsText: row.requirements_text,
    sourceType: row.source_type,
    ...(row.source_url ? { sourceUrl: row.source_url } : {}),
    capturedAt: row.captured_at,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
