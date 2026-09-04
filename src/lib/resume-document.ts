import type { ResumeContent, ResumeRecord } from "@/types/resume";

export interface ResumeDocumentSection {
  id: "summary" | "education" | "experience" | "projects" | "skills" | "languages" | "awards";
  title: string;
  entries: Array<{
    title?: string;
    subtitle?: string;
    meta?: string;
    location?: string;
    body?: string;
    bullets?: string[];
  }>;
}

export interface ResumeDocumentModel {
  name: string;
  headline: string;
  contact: string[];
  sections: ResumeDocumentSection[];
}

export function toResumeDocument(content: ResumeContent, includeContact = true): ResumeDocumentModel {
  const contact = [
    includeContact ? content.basics.email : "",
    includeContact ? content.basics.phone : "",
    includeContact ? content.basics.location : "",
    content.basics.website,
  ].filter(Boolean);

  const sections: ResumeDocumentSection[] = [];
  if (content.summary) {
    sections.push({
      id: "summary",
      title: "个人简介",
      entries: [{ body: content.summary }],
    });
  }
  if (content.education.length) {
    sections.push({
      id: "education",
      title: "教育经历",
      entries: content.education.map((item) => ({
        title: item.school,
        subtitle: [item.degree, item.major].filter(Boolean).join(" · "),
        meta: [item.startDate, item.endDate].filter(Boolean).join(" — "),
        location: includeContact ? item.location : "",
        body: item.score,
        bullets: item.highlights,
      })),
    });
  }
  if (content.experience.length) {
    sections.push({
      id: "experience",
      title: "工作与实践",
      entries: content.experience.map((item) => ({
        title: item.role,
        subtitle: item.organization,
        meta: [item.startDate, item.endDate].filter(Boolean).join(" — "),
        location: includeContact ? item.location : "",
        bullets: item.bullets,
      })),
    });
  }
  if (content.projects.length) {
    sections.push({
      id: "projects",
      title: "项目经历",
      entries: content.projects.map((item) => ({
        title: item.name,
        subtitle: item.role,
        meta: item.date,
        location: item.link,
        bullets: item.bullets,
      })),
    });
  }
  if (content.skills.length) {
    sections.push({ id: "skills", title: "技能", entries: [{ body: content.skills.join(" · ") }] });
  }
  if (content.languages.length) {
    sections.push({ id: "languages", title: "语言", entries: [{ body: content.languages.join(" · ") }] });
  }
  if (content.awards.length) {
    sections.push({ id: "awards", title: "奖项与证书", entries: [{ bullets: content.awards }] });
  }

  return {
    name: content.basics.name || "你的姓名",
    headline: content.basics.headline,
    contact,
    sections,
  };
}

export function toPlainText(resume: Pick<ResumeRecord, "content">) {
  const document = toResumeDocument(resume.content, true);
  const lines = [document.name, document.headline, document.contact.join(" | "), ""];
  for (const section of document.sections) {
    lines.push(section.title);
    for (const entry of section.entries) {
      if (entry.title || entry.subtitle || entry.meta || entry.location) {
        const identity = section.id === "experience"
          ? [entry.subtitle, entry.title]
          : [entry.title, entry.subtitle];
        lines.push(
          [...identity, entry.meta, entry.location]
            .map((part) => part ?? "")
            .join(" | ").replace(/(?:\s*\|\s*)+$/, ""),
        );
      }
      if (entry.body) lines.push(entry.body);
      if (entry.bullets?.length) lines.push(...entry.bullets.map((line) => `- ${line}`));
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

export function toPortableResumeJson(resume: ResumeRecord) {
  const { userId: _userId, targetBrief: _targetBrief, ...portable } = resume;
  void _userId;
  void _targetBrief;
  return JSON.stringify({ schemaVersion: 1, resume: portable }, null, 2);
}

export function safeFilename(value: string) {
  return value
    .replace(/[\uD800-\uDFFF]/g, "")
    .replace(/[\\/:*?"<>|]/g, "-")
    .trim() || "简历";
}
