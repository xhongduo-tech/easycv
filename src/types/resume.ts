export type Track = "study" | "career";
export type ResumeStatus = "draft" | "ready" | "archived";
export type TemplateFamily =
  | "academic"
  | "research"
  | "international"
  | "product"
  | "finance"
  | "engineering"
  | "public"
  | "corporate"
  | "editorial";
export type TemplateDensity = "compact" | "balanced" | "spacious";
export type TargetBriefKind = "career-job" | "study-program";
export type TargetBriefSource = "employer-official" | "boss" | "zhaopin" | "other-platform" | "manual";
export type EvidenceStatus = "supported" | "partial" | "missing";

export interface Basics {
  name: string;
  email: string;
  phone: string;
  location: string;
  website: string;
  headline: string;
}

export interface EducationItem {
  id: string;
  school: string;
  degree: string;
  major: string;
  startDate: string;
  endDate: string;
  location: string;
  score: string;
  highlights: string[];
}

export interface ExperienceItem {
  id: string;
  organization: string;
  role: string;
  startDate: string;
  endDate: string;
  location: string;
  bullets: string[];
}

export interface ProjectItem {
  id: string;
  name: string;
  role: string;
  date: string;
  link: string;
  bullets: string[];
}

export interface ResumeContent {
  basics: Basics;
  summary: string;
  education: EducationItem[];
  experience: ExperienceItem[];
  projects: ProjectItem[];
  skills: string[];
  languages: string[];
  awards: string[];
}

export interface ResumeRecord {
  id: string;
  userId: string;
  title: string;
  track: Track;
  targetProfileId?: string;
  targetName: string;
  templateId: string;
  status: ResumeStatus;
  progress: number;
  revision: number;
  content: ResumeContent;
  targetBrief?: TargetBrief;
  createdAt: string;
  updatedAt: string;
}

export interface TargetBrief {
  resumeId: string;
  kind: TargetBriefKind;
  focusName: string;
  requirementsText: string;
  sourceType: TargetBriefSource;
  sourceUrl?: string;
  capturedAt: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface JobFitItem {
  id: string;
  requirement: string;
  keywords: string[];
  status: EvidenceStatus;
  evidence: Array<{
    section: "basics" | "summary" | "education" | "experience" | "projects" | "skills" | "languages" | "awards";
    label: string;
    text: string;
  }>;
  action: string;
}

export interface JobFitResult {
  totalRequirements: number;
  supportedCount: number;
  partialCount: number;
  missingCount: number;
  items: JobFitItem[];
}

export interface AdminOverview {
  metrics: {
    totalResumes: number;
    activeTemplates: number;
    targetProfiles: number;
    averageProgress: number;
  };
  recentResumes: AdminResumeSummary[];
  trackBreakdown: Array<{ label: string; value: number }>;
  statusBreakdown: Array<{ label: string; value: number }>;
}

export interface AdminResumeSummary {
  id: string;
  title: string;
  track: Track;
  targetName: string;
  progress: number;
  revision: number;
  updatedAt: string;
}

export interface ResumeTemplate {
  id: string;
  name: string;
  description: string;
  track: Track | "all";
  accent: string;
  layout: "classic" | "modern" | "compact" | "editorial";
  tags: string[];
  active: boolean;
  recommendedFor: string[];
  family?: TemplateFamily;
  familyLabel?: string;
  density?: TemplateDensity;
  rationale?: string;
  principles?: string[];
}

export interface TargetProfile {
  id: string;
  track: Track;
  name: string;
  category: string;
  region: string;
  description: string;
  keywords: string[];
  priorities: string[];
  tone: string;
  sourceType?: "editorial" | "official" | "mixed";
  reviewedAt?: string;
}

export interface AdvisorResult {
  score: number;
  headline: string;
  suggestions: Array<{
    id: string;
    severity: "high" | "medium" | "low";
    title: string;
    detail: string;
  }>;
  keywords: string[];
  rewrite: string;
}
