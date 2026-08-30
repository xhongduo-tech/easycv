import type { ResumeContent } from "@/types/resume";

export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function calculateProgress(content: ResumeContent) {
  const checks = [
    content.basics.name,
    content.basics.email,
    content.basics.headline,
    content.summary,
    content.education.length > 0,
    content.experience.length > 0,
    content.projects.length > 0,
    content.skills.length >= 3,
  ];
  const completed = checks.filter(Boolean).length;
  return Math.round((completed / checks.length) * 100);
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function shortId() {
  return Math.random().toString(36).slice(2, 9);
}
