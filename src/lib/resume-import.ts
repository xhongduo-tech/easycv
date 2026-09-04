import { createBlankContent } from "@/lib/sample-data";
import { resumeContentSchema } from "@/lib/validation";
import type { EducationItem, ExperienceItem, ProjectItem, ResumeContent } from "@/types/resume";

export type ResumeImportConfidence = "exact" | "structured" | "review";

export interface ResumeImportDraft {
  sourceName: string;
  sourceKind: "json" | "text" | "docx" | "image-evidence";
  confidence: ResumeImportConfidence;
  content: ResumeContent;
  detected: string[];
  warnings: string[];
}

export interface MergeImportOptions {
  replaceExisting?: boolean;
}

const importCollectionLimits = {
  education: 30,
  experience: 50,
  projects: 50,
  skills: 100,
  languages: 30,
  awards: 50,
} as const;

type ImportSection = "summary" | "education" | "experience" | "projects" | "skills" | "languages" | "awards";

const sectionAliases: Record<string, ImportSection> = {
  "个人简介": "summary",
  "个人总结": "summary",
  "自我评价": "summary",
  "summary": "summary",
  "profile": "summary",
  "教育经历": "education",
  "教育背景": "education",
  "education": "education",
  "工作与实践": "experience",
  "工作经历": "experience",
  "实习经历": "experience",
  "实践经历": "experience",
  "experience": "experience",
  "work experience": "experience",
  "项目经历": "projects",
  "项目经验": "projects",
  "projects": "projects",
  "技能": "skills",
  "专业技能": "skills",
  "skills": "skills",
  "语言": "languages",
  "语言能力": "languages",
  "languages": "languages",
  "奖项": "awards",
  "奖项与证书": "awards",
  "奖项与荣誉": "awards",
  "荣誉": "awards",
  "证书": "awards",
  "awards": "awards",
};

export function parseResumeImportJson(source: string, sourceName = "JSON 备份"): ResumeImportDraft {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("JSON 文件无法解析，请确认它是完整的简历备份");
  }
  const candidate = extractContentCandidate(parsed);
  const checked = resumeContentSchema.safeParse(candidate);
  if (!checked.success) {
    const first = checked.error.issues[0];
    throw new Error(`JSON 简历结构不兼容${first ? `：${first.path.join(".")} ${first.message}` : ""}`);
  }
  return {
    sourceName,
    sourceKind: "json",
    confidence: "exact",
    content: checked.data,
    detected: describeDetectedContent(checked.data),
    warnings: [],
  };
}

export function parseResumeImportText(
  source: string,
  options: { sourceName?: string; sourceKind?: "text" | "docx" } = {},
): ResumeImportDraft {
  const normalized = source.replaceAll("\r\n", "\n").replaceAll("\r", "\n").trim();
  if (!normalized) throw new Error("没有读取到可导入的文字");
  if (normalized.length > 120_000) throw new Error("提取文字超过 120,000 字，请拆分后再导入");

  const content = createBlankContent();
  const warnings: string[] = [];
  const blocks = splitSections(normalized);
  parseBasics(blocks.preamble, content);
  content.summary = truncate(blocks.summary.join("\n").trim(), 2_000);
  content.education = parseEducation(blocks.education, warnings);
  content.experience = parseExperience(blocks.experience, warnings);
  content.projects = parseProjects(blocks.projects, warnings);
  content.skills = parseExtraList(normalized, blocks.skills, ["技能", "专业技能", "skills"], 120, 100);
  content.languages = parseExtraList(normalized, blocks.languages, ["语言", "语言能力", "languages"], 120, 30);
  content.awards = parseExtraList(normalized, blocks.awards, ["奖项", "奖项与证书", "奖项与荣誉", "荣誉", "证书", "awards"], 300, 50);

  const checked = resumeContentSchema.safeParse(content);
  if (!checked.success) throw new Error("导入内容超过简历字段限制，请缩短后重试");
  const detected = describeDetectedContent(checked.data);
  if (!detected.length) {
    warnings.push("未识别到明确字段。建议补充分段标题，或把需要保留的内容作为图片证据逐条确认。");
  }
  warnings.unshift("自动识别只生成候选稿；请在合并前核对姓名、日期、数字和经历归属。");
  if (options.sourceKind === "docx") {
    warnings.push("Word 导入仅保留可识别的章节、段落和列表线索，不保留原版式或图片；表格与复杂排版可能错位，请逐项核对。");
  }

  return {
    sourceName: options.sourceName ?? "粘贴文字",
    sourceKind: options.sourceKind ?? "text",
    confidence: options.sourceKind === "docx" ? "review" : "structured",
    content: checked.data,
    detected,
    warnings,
  };
}

export function createImageEvidenceDraft(
  text: string,
  destination: "awards" | "skills" | "summary",
  sourceName: string,
): ResumeImportDraft {
  const verified = text.trim();
  if (!verified) throw new Error("请先输入你已从图片中核对过的事实");
  const content = createBlankContent();
  if (destination === "summary") content.summary = truncate(verified, 2_000);
  if (destination === "skills") content.skills = splitList(verified).slice(0, 100).map((item) => truncate(item, 120));
  if (destination === "awards") content.awards = splitLines(verified).slice(0, 50).map((item) => truncate(item, 300));
  const checked = resumeContentSchema.safeParse(content);
  if (!checked.success) throw new Error("确认文字超过简历字段限制，请缩短后重试");
  return {
    sourceName,
    sourceKind: "image-evidence",
    confidence: "review",
    content: checked.data,
    detected: describeDetectedContent(checked.data),
    warnings: ["图片原件仅在当前浏览器中预览，不会上传或保存；只有你确认的文字会进入候选稿。"],
  };
}

export function mergeImportedContent(
  current: ResumeContent,
  imported: ResumeContent,
  options: MergeImportOptions = {},
): ResumeContent {
  const merged = mergeImportedContentWithoutLimits(current, imported, options);
  const limited: ResumeContent = {
    ...merged,
    education: merged.education.slice(0, importCollectionLimits.education),
    experience: merged.experience.slice(0, importCollectionLimits.experience),
    projects: merged.projects.slice(0, importCollectionLimits.projects),
    skills: merged.skills.slice(0, importCollectionLimits.skills),
    languages: merged.languages.slice(0, importCollectionLimits.languages),
    awards: merged.awards.slice(0, importCollectionLimits.awards),
  };
  const checked = resumeContentSchema.safeParse(limited);
  if (!checked.success) throw new Error("合并后的候选内容不符合简历字段限制");
  return checked.data;
}

export function getImportCapacityWarnings(current: ResumeContent, imported: ResumeContent) {
  const merged = mergeImportedContentWithoutLimits(current, imported, { replaceExisting: false });
  const labels: Record<keyof typeof importCollectionLimits, string> = {
    education: "教育经历",
    experience: "工作与实践",
    projects: "项目经历",
    skills: "技能",
    languages: "语言",
    awards: "奖项与证书",
  };
  return (Object.keys(importCollectionLimits) as Array<keyof typeof importCollectionLimits>)
    .filter((key) => merged[key].length > importCollectionLimits[key])
    .map((key) => `合并后${labels[key]}超过 ${importCollectionLimits[key]} 项上限，超出的候选项不会加入；请先在当前简历或候选稿中精简。`);
}

function mergeImportedContentWithoutLimits(
  current: ResumeContent,
  imported: ResumeContent,
  options: MergeImportOptions = {},
): ResumeContent {
  const replace = options.replaceExisting === true;
  const basics = { ...current.basics };
  for (const key of Object.keys(basics) as Array<keyof ResumeContent["basics"]>) {
    const incoming = imported.basics[key];
    if (incoming && (replace || !basics[key])) basics[key] = incoming;
  }
  return {
    basics,
    summary: imported.summary && (replace || !current.summary) ? imported.summary : current.summary,
    education: mergeEntries(current.education, imported.education, educationSignature, "edu"),
    experience: mergeEntries(current.experience, imported.experience, experienceSignature, "exp"),
    projects: mergeEntries(current.projects, imported.projects, projectSignature, "project"),
    skills: mergeStrings(current.skills, imported.skills),
    languages: mergeStrings(current.languages, imported.languages),
    awards: mergeStrings(current.awards, imported.awards),
  };
}

export function mergeImportDrafts(left: ResumeImportDraft | null, right: ResumeImportDraft): ResumeImportDraft {
  if (!left) return right;
  const conflictWarnings = detectImportConflicts(left, right);
  const capacityWarnings = getImportCapacityWarnings(left.content, right.content);
  return {
    sourceName: `${left.sourceName}、${right.sourceName}`,
    sourceKind: left.sourceKind,
    confidence: "review",
    content: mergeImportedContent(left.content, right.content, { replaceExisting: false }),
    detected: [...new Set([...left.detected, ...right.detected])],
    warnings: [...new Set([
      ...left.warnings,
      ...right.warnings,
      ...conflictWarnings,
      ...capacityWarnings,
      "已合并多份资料，候选稿不再等同于任一原始备份；请逐项核对后再应用。",
    ])],
  };
}

function extractContentCandidate(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  const resume = record.resume;
  if (resume && typeof resume === "object" && "content" in resume) {
    return (resume as Record<string, unknown>).content;
  }
  if (record.content && typeof record.content === "object") return record.content;
  return value;
}

function splitSections(source: string) {
  const result = {
    preamble: [] as string[],
    summary: [] as string[],
    education: [] as string[],
    experience: [] as string[],
    projects: [] as string[],
    skills: [] as string[],
    languages: [] as string[],
    awards: [] as string[],
  };
  let active: keyof typeof result = "preamble";
  const sourceLines = source.split("\n");
  for (let index = 0; index < sourceLines.length; index += 1) {
    const rawLine = sourceLines[index] ?? "";
    const line = stripMarkdownDecoration(rawLine.trim());
    const heading = normalizeHeading(line);
    const nextLine = sourceLines[index + 1]?.trim() ?? "";
    const isSetextHeading = Boolean(line) && /^(?:=+|-{3,})$/.test(nextLine);
    if (sectionAliases[heading]) {
      active = sectionAliases[heading];
      if (isSetextHeading) index += 1;
      continue;
    }
    if (isSetextHeading) {
      result[active].push(line);
      index += 1;
      continue;
    }
    const inlineExtra = line.match(/^(技能|专业技能|skills|语言|语言能力|languages|奖项|奖项与证书|奖项与荣誉|荣誉|证书|awards)\s*[:：]\s*(.*)$/i);
    if (inlineExtra) {
      active = sectionAliases[inlineExtra[1].toLowerCase()];
      if (inlineExtra[2]) result[active].push(inlineExtra[2]);
      continue;
    }
    result[active].push(line);
  }
  return result;
}

function normalizeHeading(value: string) {
  return value.replace(/[:：]$/, "").trim().toLowerCase();
}

function stripMarkdownDecoration(value: string) {
  let next = value.replace(/^#{1,6}\s+/, "").replace(/\s+#{1,6}$/, "").trim();
  const bold = next.match(/^(?:\*\*|__)(.+?)(?:\*\*|__)(.*)$/);
  if (bold) next = `${bold[1] ?? ""}${bold[2] ?? ""}`.trim();
  return next;
}

function detectImportConflicts(left: ResumeImportDraft, right: ResumeImportDraft) {
  const warnings: string[] = [];
  const basicsLabels: Record<keyof ResumeContent["basics"], string> = {
    name: "姓名",
    email: "邮箱",
    phone: "电话",
    location: "所在地",
    website: "个人链接",
    headline: "职业定位",
  };
  for (const key of Object.keys(basicsLabels) as Array<keyof ResumeContent["basics"]>) {
    const existing = left.content.basics[key];
    const incoming = right.content.basics[key];
    if (existing && incoming && normalizeSignature(existing) !== normalizeSignature(incoming)) {
      warnings.push(`多源冲突：${basicsLabels[key]}在“${left.sourceName}”和“${right.sourceName}”中不同，候选稿暂保留前一来源。`);
    }
  }
  if (left.content.summary && right.content.summary
    && normalizeSignature(left.content.summary) !== normalizeSignature(right.content.summary)) {
    warnings.push(`多源冲突：个人简介在“${left.sourceName}”和“${right.sourceName}”中不同，候选稿暂保留前一来源。`);
  }
  warnings.push(...detectEntryConflicts(
    left.content.education,
    right.content.education,
    educationSignature,
    "教育经历",
  ));
  warnings.push(...detectEntryConflicts(
    left.content.experience,
    right.content.experience,
    experienceSignature,
    "工作经历",
  ));
  warnings.push(...detectEntryConflicts(
    left.content.projects,
    right.content.projects,
    projectSignature,
    "项目经历",
  ));
  return warnings;
}

function detectEntryConflicts<T extends { id: string }>(
  existing: T[],
  incoming: T[],
  signature: (item: T) => string,
  label: string,
) {
  const bySignature = new Map(existing.map((item) => [signature(item), item]));
  const warnings: string[] = [];
  for (const item of incoming) {
    const key = signature(item);
    const match = key ? bySignature.get(key) : undefined;
    if (match && comparableEntry(match) !== comparableEntry(item)) {
      warnings.push(`多源冲突：同一条${label}包含不同的地点、描述或链接，候选稿暂保留前一来源；请展开候选内容核对。`);
    }
  }
  return warnings;
}

function comparableEntry<T extends { id: string }>(item: T) {
  return JSON.stringify(Object.entries(item).filter(([key]) => key !== "id"));
}

function parseBasics(lines: string[], content: ResumeContent) {
  const meaningful = lines.filter(Boolean).slice(0, 12);
  const all = meaningful.join(" | ");
  content.basics.email = all.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";
  content.basics.website = all.match(/(?:https?:\/\/|www\.)[^\s|]+|\b(?:linkedin\.com|github\.com)\/[^\s|]+/i)?.[0] ?? "";
  const splitPreamble = meaningful.map((line) => ({
    line,
    parts: line.split(/[|·\t]/).map((item) => item.trim()).filter(Boolean),
  }));
  const phoneMatch = splitPreamble
    .flatMap(({ line, parts }) => parts.map((part) => ({
      line,
      value: part.match(/(?:\+?\d[\d\s()-]{5,}\d)/)?.[0]?.trim() ?? "",
    })))
    .find(({ value }) => value.replace(/\D/g, "").length >= 7 && !/^\d{4}\s*[-—–]\s*\d{4}$/.test(value));
  content.basics.phone = phoneMatch?.value ?? "";
  const contactLines = new Set(splitPreamble
    .filter(({ line }) => line.includes("@")
      || /https?:\/\/|www\.|linkedin\.com|github\.com/i.test(line)
      || line === phoneMatch?.line)
    .map(({ line }) => line));
  const contactParts = splitPreamble
    .filter(({ line }) => contactLines.has(line))
    .flatMap(({ parts }) => parts);

  const candidates = meaningful.filter((line) => {
    if (contactLines.has(line)) return false;
    return !Object.prototype.hasOwnProperty.call(sectionAliases, line.replace(/[:：]$/, "").toLowerCase());
  });
  content.basics.name = truncate(candidates[0]?.split("|")[0]?.trim() ?? "", 120);
  content.basics.headline = truncate(candidates[1]?.split("|")[0]?.trim() ?? "", 240);

  content.basics.location = truncate(contactParts.find((part) => part
    && part !== content.basics.name
    && part !== content.basics.headline
    && part !== content.basics.email
    && part !== content.basics.phone
    && part !== content.basics.website
    && !/\d{4}[.\/-]\d{1,2}/.test(part)) ?? "", 160);
}

function parseEducation(lines: string[], warnings: string[]): EducationItem[] {
  return parseEntryGroups(lines).slice(0, 30).map((group, index) => {
    const [header = "", ...details] = group;
    const parts = header.split("|").map((item) => item.trim());
    const [degree = "", major = ""] = (parts[1] ?? "").split("·").map((item) => item.trim());
    const dates = splitDates(parts[2] ?? "");
    if (parts.length < 2) warnings.push(`教育经历“${truncate(header, 24)}”未完全结构化，请合并后补充学位和日期。`);
    const score = details.find((line) => line && !isBullet(line)) ?? "";
    return {
      id: importId("edu", index, header),
      school: truncate(parts[0] ?? "", 240),
      degree: truncate(degree, 160),
      major: truncate(major, 160),
      startDate: truncate(dates[0], 40),
      endDate: truncate(dates[1], 40),
      location: truncate(parts[3] ?? "", 160),
      score: truncate(score, 160),
      highlights: details.filter((line) => line !== score).map(stripBullet).filter(Boolean).slice(0, 30).map((line) => truncate(line, 800)),
    };
  }).filter((item) => item.school);
}

function parseExperience(lines: string[], warnings: string[]): ExperienceItem[] {
  return parseEntryGroups(lines).slice(0, 50).map((group, index) => {
    const [header = "", ...details] = group;
    const parts = header.split("|").map((item) => item.trim());
    const dates = splitDates(parts[2] ?? "");
    if (parts.length < 2) warnings.push(`工作经历“${truncate(header, 24)}”未完全结构化，请合并后补充角色和日期。`);
    return {
      id: importId("exp", index, header),
      organization: truncate(parts[0] ?? "", 240),
      role: truncate(parts[1] ?? "", 160),
      startDate: truncate(dates[0], 40),
      endDate: truncate(dates[1], 40),
      location: truncate(parts[3] ?? "", 160),
      bullets: details.map(stripBullet).filter(Boolean).slice(0, 30).map((line) => truncate(line, 800)),
    };
  }).filter((item) => item.organization || item.role || item.bullets.length);
}

function parseProjects(lines: string[], warnings: string[]): ProjectItem[] {
  return parseEntryGroups(lines).slice(0, 50).map((group, index) => {
    const [header = "", ...details] = group;
    const parts = header.split("|").map((item) => item.trim());
    if (parts.length < 2) warnings.push(`项目“${truncate(header, 24)}”未完全结构化，请合并后补充角色和时间。`);
    return {
      id: importId("project", index, header),
      name: truncate(parts[0] ?? "", 240),
      role: truncate(parts[1] ?? "", 160),
      date: truncate(parts[2] ?? "", 80),
      link: truncate(parts[3] ?? "", 500),
      bullets: details.map(stripBullet).filter(Boolean).slice(0, 30).map((line) => truncate(line, 800)),
    };
  }).filter((item) => item.name || item.bullets.length);
}

function parseEntryGroups(lines: string[]) {
  const groups: string[][] = [];
  let current: string[] = [];
  const flush = () => {
    if (current.some(Boolean)) groups.push(current.filter(Boolean));
    current = [];
  };
  for (const line of lines) {
    if (!line) {
      continue;
    }
    const looksLikeHeader = !isBullet(line) && line.includes("|");
    if (looksLikeHeader && current.length) flush();
    current.push(line);
  }
  flush();
  return groups;
}

function parseExtraList(source: string, block: string[], labels: string[], maxLength: number, maxItems: number) {
  const pattern = new RegExp(`^(?:${labels.map(escapeRegExp).join("|")})\\s*[:：]\\s*(.*)$`, "gim");
  const values = block.flatMap((line) => splitList(stripBullet(line)));
  for (const match of source.matchAll(pattern)) values.push(...splitList(match[1] ?? ""));
  return mergeStrings([], values.map((item) => truncate(item, maxLength))).slice(0, maxItems);
}

function describeDetectedContent(content: ResumeContent) {
  const detected: string[] = [];
  const basicsCount = Object.values(content.basics).filter(Boolean).length;
  if (basicsCount) detected.push(`个人信息 ${basicsCount} 项`);
  if (content.summary) detected.push("个人简介");
  if (content.education.length) detected.push(`教育经历 ${content.education.length} 条`);
  if (content.experience.length) detected.push(`工作与实践 ${content.experience.length} 条`);
  if (content.projects.length) detected.push(`项目经历 ${content.projects.length} 条`);
  if (content.skills.length) detected.push(`技能 ${content.skills.length} 项`);
  if (content.languages.length) detected.push(`语言 ${content.languages.length} 项`);
  if (content.awards.length) detected.push(`奖项与证书 ${content.awards.length} 项`);
  return detected;
}

function mergeEntries<T extends { id: string }>(
  current: T[],
  imported: T[],
  signature: (item: T) => string,
  prefix: string,
) {
  const seen = new Set(current.map(signature).filter(Boolean));
  const ids = new Set(current.map((item) => item.id));
  const next = [...current];
  for (const item of imported) {
    const key = signature(item);
    if (!key || seen.has(key)) continue;
    let id = item.id;
    let suffix = 1;
    while (ids.has(id)) id = `${prefix}-${stableHash(`${key}-${suffix++}`)}`;
    next.push({ ...item, id });
    ids.add(id);
    seen.add(key);
  }
  return next;
}

function mergeStrings(current: string[], imported: string[]) {
  const seen = new Set(current.map(normalizeSignature));
  const next = [...current];
  for (const item of imported) {
    const key = normalizeSignature(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    next.push(item);
  }
  return next;
}

function educationSignature(item: EducationItem) {
  return normalizeSignature([item.school, item.degree, item.major, item.startDate, item.endDate].join("|"));
}

function experienceSignature(item: ExperienceItem) {
  return normalizeSignature([item.organization, item.role, item.startDate, item.endDate].join("|"));
}

function projectSignature(item: ProjectItem) {
  return normalizeSignature([item.name, item.role, item.date].join("|"));
}

function splitDates(value: string): [string, string] {
  const parts = value.split(/\s+(?:—|–|-)\s+/).map((item) => item.trim());
  return [parts[0] ?? "", parts[1] ?? ""];
}

function splitList(value: string) {
  return value.split(/[\n,，、;；·]/).map((item) => item.trim()).filter(Boolean);
}

function splitLines(value: string) {
  return value.split(/[\n;；]/).map(stripBullet).filter(Boolean);
}

function stripBullet(value: string) {
  return value.replace(/^[-*•·]\s*/, "").trim();
}

function isBullet(value: string) {
  return /^[-*•]\s*/.test(value);
}

function normalizeSignature(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function importId(prefix: string, index: number, value: string) {
  return `${prefix}-import-${index + 1}-${stableHash(value || String(index))}`;
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).slice(0, 7);
}

function truncate(value: string, max: number) {
  return value.trim().slice(0, max);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
