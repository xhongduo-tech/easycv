import type {
  JobFitItem,
  JobFitResult,
  ResumeContent,
  TargetBrief,
  TargetBriefSource,
} from "@/types/resume";

type Evidence = JobFitItem["evidence"][number] & { direct: boolean };

const signalGroups: Array<{ label: string; terms: string[] }> = [
  { label: "数据分析", terms: ["数据分析", "数据驱动", "sql", "python", "excel", "tableau", "power bi", "统计", "analytics", "analysis"] },
  { label: "产品能力", terms: ["产品", "用户研究", "需求分析", "产品规划", "roadmap", "user research", "product", "指标体系"] },
  { label: "软件工程", terms: ["软件工程", "后端", "前端", "算法", "架构", "java", "javascript", "typescript", "c++", "golang", "go", "cloud", "分布式"] },
  { label: "金融分析", terms: ["金融", "财务", "估值", "建模", "会计", "investment", "valuation", "financial modeling", "accounting", "bloomberg"] },
  { label: "商业与咨询", terms: ["商业分析", "市场研究", "行业研究", "咨询", "策略", "strategy", "consulting", "commercial", "case"] },
  { label: "项目管理", terms: ["项目管理", "项目推进", "交付", "进度", "风险管理", "project management", "delivery", "agile", "scrum"] },
  { label: "沟通协作", terms: ["沟通", "协作", "跨团队", "跨部门", "客户沟通", "stakeholder", "communication", "collaboration", "presentation"] },
  { label: "领导与所有权", terms: ["领导", "带领", "管理团队", "端到端", "主导", "ownership", "leadership", "lead"] },
  { label: "工程制造", terms: ["制造", "质量", "安全", "工艺", "供应链", "质量管理", "six sigma", "lean", "cad", "solidworks"] },
  { label: "研究能力", terms: ["研究", "实验", "论文", "文献", "方法论", "research", "experiment", "publication", "methodology"] },
  { label: "英语与国际协作", terms: ["英语", "英文", "跨文化", "国际协作", "english", "global", "cross-cultural", "bilingual"] },
  { label: "市场与增长", terms: ["市场", "增长", "品牌", "渠道", "用户运营", "marketing", "growth", "brand", "campaign"] },
  { label: "教育背景", terms: ["本科", "学士", "硕士", "研究生", "博士", "学历", "学位", "专业", "计算机", "工科", "bachelor", "master", "phd", "degree", "major"] },
];

const requirementCue = /(职责|负责|要求|任职|资格|优先|熟悉|掌握|具备|能够|能力|经验|knowledge|proficien|experience|responsibil|qualification|skill|ability|preferred|required)/i;
const excludedCue = /(薪资|薪酬|福利|团建|下午茶|五险|公积金|补贴|工作地点|公司介绍|关于我们|benefit|compensation|salary)/i;
const contactCue = /(联系(?:人|方式|电话)|招聘邮箱|邮箱|手机|座机|电话|微信|wechat|qq|e-?mail|@[a-z0-9.-]+)/i;
const instructionCue = /(ignore (?:all |the )?(?:previous|prior) instructions?|system prompt|reveal (?:secrets?|data)|忽略(?:以上|之前|前述)指令|系统提示词|泄露(?:信息|数据))/i;
const metricPattern = /\d+(?:\.\d+)?\s*(?:%|名|人|次|万|千|周|月|项|篇|家|个|小时|天|倍|\+)/;
const outcomePattern = /(提升|降低|增长|完成|上线|交付|节省|优化|缩短|实现|获得|覆盖|improv|reduc|increase|deliver|launch|save|achiev)/i;
const genericKeywords = new Set(["学历", "学位", "专业", "能力", "经验", "要求", "职责", "qualification", "qualifications"]);
const equivalentTerms = [
  ["本科", "学士", "bachelor"],
  ["硕士", "研究生", "master"],
  ["博士", "phd", "doctorate"],
  ["英语", "英文", "english"],
  ["六级", "cet6", "cet-6"],
  ["四级", "cet4", "cet-4"],
  ["后端", "backend", "back-end"],
  ["前端", "frontend", "front-end"],
] as const;

export const targetBriefSourceLabels: Record<TargetBriefSource, string> = {
  "employer-official": "企业官方招聘页（用户提供，未核验）",
  boss: "BOSS直聘（用户提供，未核验）",
  zhaopin: "智联招聘（用户提供，未核验）",
  "other-platform": "招聘平台、内推或其他渠道（用户提供，未核验）",
  manual: "用户确认的文字（未核验）",
};

export function analyzeJobFit(content: ResumeContent, brief: Pick<TargetBrief, "requirementsText">): JobFitResult {
  const requirements = extractRequirements(brief.requirementsText);
  const evidence = collectEvidence(content);
  const items = requirements.map((requirement, index) => mapRequirement(requirement, evidence, index));
  return {
    totalRequirements: items.length,
    supportedCount: items.filter((item) => item.status === "supported").length,
    partialCount: items.filter((item) => item.status === "partial").length,
    missingCount: items.filter((item) => item.status === "missing").length,
    items,
  };
}

export function extractRequirements(text: string, limit = 12) {
  if (!text.trim()) return [];
  const prepared = text
    .replace(/\r/g, "\n")
    .replace(/[•●▪◦]/g, "\n")
    .replace(/(?:^|\n)\s*[-*]\s+/g, "\n")
    .replace(/[；;]/g, "\n")
    .replace(/。(?=\S)/g, "。\n");
  const candidates = prepared
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:\d+[.)、]|[一二三四五六七八九十]+[、.])\s*/, "").trim())
    .filter((line) => line.length >= 6 && line.length <= 260)
    .filter((line) => !excludedCue.test(line) && !contactCue.test(line) && !instructionCue.test(line))
    .filter((line) => requirementCue.test(line) || hasKnownSignal(line))
    .map((line) => line.replace(/^(?:岗位职责|任职要求|职位要求|任职资格|工作职责|requirements?|qualifications?)\s*[:：]?\s*/i, "").trim())
    .filter((line) => line.length >= 6);

  const unique: string[] = [];
  for (const candidate of candidates) {
    const normalized = normalize(candidate);
    if (unique.some((item) => normalize(item) === normalized)) continue;
    unique.push(candidate.length > 180 ? `${candidate.slice(0, 177)}…` : candidate);
    if (unique.length >= limit) break;
  }

  return unique;
}

export function redactJobDescriptionForModel(text: string) {
  return text
    .replace(/[A-Z0-9._%+-]+\s*(?:\[at\]|\(at\)|＠)\s*[A-Z0-9.-]+\s*(?:\[dot\]|\(dot\)|\.)\s*[A-Z]{2,}/gi, "[招聘联系邮箱已移除]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[招聘联系邮箱已移除]")
    .replace(/(?:电话|手机|座机|联系电话|tel(?:ephone)?|phone|mobile)\s*[:：]?\s*(?:\+?\d[\d\s().-]{5,}\d)/gi, "[招聘联系电话已移除]")
    .replace(/(?:\+?86[-\s]?)?1[3-9]\d[-\s]?\d{4}[-\s]?\d{4}/g, "[招聘联系电话已移除]")
    .replace(/(?:400|800)[-\s]?\d{3}[-\s]?\d{4}/g, "[招聘联系电话已移除]")
    .replace(/\b0\d{2,3}[-\s]?\d{7,8}\b/g, "[招聘联系电话已移除]")
    .replace(/\+\d{1,3}[\s.-]?(?:\(\d{1,4}\)[\s.-]?)?\d[\d\s.-]{5,}\d/g, "[招聘联系电话已移除]")
    .replace(/(?:联系人|contact)(?:\s*(?:微信(?:号)?|wechat(?:\s*id)?|vx))?\s*[:：]?\s*[A-Za-z\u4e00-\u9fff·0-9_-]{2,30}/gi, "[招聘联系人已移除]")
    .replace(/(?:微信(?:号)?|wechat(?:\s*id)?|vx|qq)\s*[:：]?\s*[A-Za-z0-9_-]{3,}/gi, "[招聘联系账号已移除]");
}

function collectEvidence(content: ResumeContent): Evidence[] {
  const items: Evidence[] = [];
  const push = (
    section: Evidence["section"],
    label: string,
    text: string,
    direct = false,
    sourceRef?: Evidence["sourceRef"],
  ) => {
    const value = text.trim();
    if (value) items.push({ section, label, text: value, direct, sourceRef });
  };
  push("basics", "职业标题", content.basics.headline);
  push("summary", "个人简介", content.summary, false, { section: "summary", field: "summary" });
  for (const entry of content.education) {
    push("education", entry.school || "教育经历", [entry.school, entry.degree, entry.major].filter(Boolean).join(" · "), true);
    push("education", entry.school || "教育经历", entry.score, true);
    entry.highlights.forEach((text, index) => push(
      "education",
      entry.school || "教育经历",
      text,
      hasResultEvidence(text),
      { section: "education", field: "highlights", itemId: entry.id, index },
    ));
  }
  for (const entry of content.experience) {
    const label = [entry.organization, entry.role].filter(Boolean).join(" · ") || "工作与实践";
    push("experience", label, [entry.role, entry.organization].filter(Boolean).join(" · "), true);
    entry.bullets.forEach((text, index) => push(
      "experience",
      label,
      text,
      hasResultEvidence(text),
      { section: "experience", field: "bullets", itemId: entry.id, index },
    ));
  }
  for (const entry of content.projects) {
    const label = entry.name || "项目经历";
    push("projects", label, [entry.name, entry.role].filter(Boolean).join(" · "), true);
    entry.bullets.forEach((text, index) => push(
      "projects",
      label,
      text,
      hasResultEvidence(text),
      { section: "projects", field: "bullets", itemId: entry.id, index },
    ));
  }
  for (const text of content.skills) push("skills", "技能", text);
  for (const text of content.languages) push("languages", "语言", text, true);
  for (const text of content.awards) push("awards", "奖项与证书", text, true);
  return items;
}

function mapRequirement(requirement: string, evidence: Evidence[], index: number): JobFitItem {
  const keywords = keywordsFor(requirement);
  const matches = evidence
    .map((item) => ({
      item,
      matches: keywords.filter((keyword) => evidenceMatchesKeyword(item.text, keyword)),
    }))
    .filter((match) => match.matches.length > 0)
    .sort((a, b) => {
      const aStrong = isStrongEvidence(a.item);
      const bStrong = isStrongEvidence(b.item);
      return Number(bStrong) - Number(aStrong) || b.matches.length - a.matches.length;
    });
  const stronglyCovered = new Set(matches
    .filter((match) => isStrongEvidence(match.item))
    .flatMap((match) => match.matches));
  const fullySupported = keywords.length > 0 && keywords.every((keyword) => stronglyCovered.has(keyword));
  const status = fullySupported ? "supported" : matches.length ? "partial" : "missing";
  const focus = keywords[0] ?? "该项要求";
  const action = status === "supported"
    ? `优先保留这条证据，并明确你的职责边界、所用方法与可核验结果；不要只重复“${focus}”关键词。`
    : status === "partial"
      ? `目前只有相关线索。补充你在什么场景使用“${focus}”、采取了什么行动，以及结果如何被验证。`
      : `当前材料没有找到直接证据。若你确有相关经历，请先补充事实；否则不要为了迎合岗位而编造“${focus}”。`;
  const selectedMatches: typeof matches = [];
  for (const keyword of keywords) {
    const match = matches.find((candidate) => candidate.matches.includes(keyword) && !selectedMatches.includes(candidate));
    if (match) selectedMatches.push(match);
    if (selectedMatches.length >= 3) break;
  }
  for (const match of matches) {
    if (selectedMatches.length >= 3) break;
    if (!selectedMatches.includes(match)) selectedMatches.push(match);
  }
  return {
    id: `requirement-${index + 1}`,
    requirement,
    keywords,
    status,
    evidence: selectedMatches.map(({ item }) => ({
      section: item.section,
      label: item.label,
      text: item.text,
      ...(item.sourceRef ? { sourceRef: item.sourceRef } : {}),
    })),
    action,
  };
}

function keywordsFor(text: string) {
  const normalized = normalize(text);
  const keywords: string[] = [];
  for (const group of signalGroups) {
    const matched = group.terms.filter((term) => normalized.includes(normalize(term)) && !genericKeywords.has(term.toLowerCase()));
    if (matched.length) keywords.push(...matched);
  }
  const technicalTokens = text.match(/\b(?:[A-Za-z][A-Za-z0-9+.#-]{1,24})\b/g) ?? [];
  keywords.push(...technicalTokens.filter((token) => !/^(and|the|with|for|you|our|are|will|job|work|team|years?|from|this|that|have|ability|skills?|experience|responsibilities|requirements?|qualifications?|preferred|proficiency|proficient|using|use)$/i.test(token)));
  return [...new Set(keywords.map((keyword) => keyword.toLowerCase()))].slice(0, 8);
}

function hasKnownSignal(text: string) {
  const normalized = normalize(text);
  return signalGroups.some((group) => group.terms.some((term) => normalized.includes(normalize(term))));
}

function hasResultEvidence(text: string) {
  return metricPattern.test(text) || outcomePattern.test(text);
}

function isStrongEvidence(evidence: Evidence) {
  return evidence.section !== "skills" && (evidence.direct || hasResultEvidence(evidence.text));
}

function evidenceMatchesKeyword(text: string, keyword: string) {
  const normalizedText = normalize(text);
  const normalizedKeyword = normalize(keyword);
  if (normalizedText.includes(normalizedKeyword)) return true;
  const equivalents = equivalentTerms.find((terms) => terms.some((term) => normalize(term) === normalizedKeyword));
  return equivalents?.some((term) => normalizedText.includes(normalize(term))) ?? false;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[\s，。；、:：,.()（）/\\_-]+/g, "");
}
