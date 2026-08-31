import type {
  AdvisorSection,
  JobFitItem,
  JobFitResult,
  ResumeContent,
  RewriteProposal,
  RewriteSourceRef,
} from "@/types/resume";

export interface RewriteFocus {
  requirementId: string;
  sourceRef: RewriteSourceRef;
}

export interface RawRewriteProposal {
  sourceRef: RewriteSourceRef;
  originalText: string;
  draftText: string;
  rationale: string[];
  missingFacts: string[];
  requirementId?: string | null;
}

interface NarrativeSource {
  sourceRef: RewriteSourceRef;
  text: string;
  label: string;
}

const placeholderPattern = /【[^】]+】|(?:待核实|待确认|待补充|TBD|TO BE CONFIRMED)/i;
const knownClaimTokenPattern = /^(?:python|java|javascript|typescript|react|vue|angular|node|node\.js|sql|mysql|postgresql|redis|excel|figma|tableau|powerbi|golang|rust|c\+\+|c#|aws|azure|gcp|spark|hadoop|docker|kubernetes)$/i;
const chineseClaimTerms = [
  "负责", "参与", "协助", "主导", "领导", "管理", "带领", "独立负责", "推动", "协调",
  "建立", "搭建", "实现", "完成", "分析", "研究", "制定", "设计", "开发", "架构", "精通", "熟练",
  "提升", "降低", "增长", "节省", "上线", "交付", "获奖", "一等奖", "二等奖", "证书",
  "博士", "硕士", "本科", "机器学习", "人工智能", "数据分析", "项目管理", "英语", "德语",
];
const englishClaimTerms = [
  "lead", "led", "manage", "managed", "own", "owned", "design", "designed", "build", "built",
  "develop", "developed", "launch", "launched", "deliver", "delivered", "increase", "increased",
  "reduce", "reduced", "achieve", "achieved", "certified", "proficient", "expert",
];
const namedEntityPattern = /[A-Za-z0-9\u4e00-\u9fff·]{2,30}(?:公司|集团|大学|学院|银行|实验室|研究院|工程师|经理|负责人|实习生|研究员|顾问)/g;

export function buildNarrativeSources(content: ResumeContent, section: AdvisorSection): NarrativeSource[] {
  const sources: NarrativeSource[] = [];
  const include = (candidate: NarrativeSource) => {
    if (candidate.text.trim()) sources.push({ ...candidate, text: candidate.text.trim() });
  };

  if (section === "overview" || section === "summary") {
    include({ sourceRef: { section: "summary", field: "summary" }, text: content.summary, label: "个人简介" });
  }
  if (section === "overview" || section === "education") {
    for (const entry of content.education) {
      entry.highlights.forEach((text, index) => include({
        sourceRef: { section: "education", field: "highlights", itemId: entry.id, index },
        text,
        label: entry.school || "教育经历",
      }));
    }
  }
  if (section === "overview" || section === "experience") {
    for (const entry of content.experience) {
      entry.bullets.forEach((text, index) => include({
        sourceRef: { section: "experience", field: "bullets", itemId: entry.id, index },
        text,
        label: [entry.organization, entry.role].filter(Boolean).join(" · ") || "工作与实践",
      }));
    }
  }
  if (section === "overview" || section === "projects") {
    for (const entry of content.projects) {
      entry.bullets.forEach((text, index) => include({
        sourceRef: { section: "projects", field: "bullets", itemId: entry.id, index },
        text,
        label: entry.name || "项目经历",
      }));
    }
  }
  return sources;
}

export function getTextAtSourceRef(content: ResumeContent, sourceRef: RewriteSourceRef) {
  if (sourceRef.section === "summary") return content.summary;
  if (sourceRef.section === "education") {
    return content.education.find((item) => item.id === sourceRef.itemId)?.highlights[sourceRef.index] ?? null;
  }
  if (sourceRef.section === "experience") {
    return content.experience.find((item) => item.id === sourceRef.itemId)?.bullets[sourceRef.index] ?? null;
  }
  return content.projects.find((item) => item.id === sourceRef.itemId)?.bullets[sourceRef.index] ?? null;
}

export function replaceTextAtSourceRef(
  content: ResumeContent,
  sourceRef: RewriteSourceRef,
  expectedText: string,
  replacementText: string,
): ResumeContent | null {
  if (getTextAtSourceRef(content, sourceRef) !== expectedText) return null;
  if (sourceRef.section === "summary") return { ...content, summary: replacementText };
  if (sourceRef.section === "education") return {
    ...content,
    education: content.education.map((item) => item.id === sourceRef.itemId ? {
      ...item,
      highlights: item.highlights.map((text, index) => index === sourceRef.index ? replacementText : text),
    } : item),
  };
  if (sourceRef.section === "experience") return {
    ...content,
    experience: content.experience.map((item) => item.id === sourceRef.itemId ? {
      ...item,
      bullets: item.bullets.map((text, index) => index === sourceRef.index ? replacementText : text),
    } : item),
  };
  return {
    ...content,
    projects: content.projects.map((item) => item.id === sourceRef.itemId ? {
      ...item,
      bullets: item.bullets.map((text, index) => index === sourceRef.index ? replacementText : text),
    } : item),
  };
}

export function createLocalRewriteProposals(
  content: ResumeContent,
  section: AdvisorSection,
  jobFit?: JobFitResult,
  focus?: RewriteFocus,
): RewriteProposal[] {
  const allSources = buildNarrativeSources(content, section);
  const sources = focus
    ? allSources.filter((source) => sameSourceRef(source.sourceRef, focus.sourceRef)).slice(0, 1)
    : allSources.slice(0, 3);

  return sources.map((source, index) => {
    const requirement = requirementForSource(jobFit, source.sourceRef, focus?.requirementId);
    const draftText = tightenText(source.text);
    const changed = draftText !== source.text && !placeholderPattern.test(draftText);
    const rationale = requirement
      ? [
          `对应岗位要求“${truncate(requirement.requirement, 64)}”`,
          "仅压缩冗余表达，保留原文中的职责、工具与结果",
        ]
      : ["压缩冗余表达，让动作更直接", "不新增原文中不存在的职责、工具或结果"];
    return {
      id: `local-${source.sourceRef.section}-${index + 1}`,
      generator: "local-rules",
      status: changed ? "ready" : "needs-facts",
      sourceRef: source.sourceRef,
      originalText: source.text,
      draftText: changed ? draftText : source.text,
      rationale,
      missingFacts: changed ? [] : ["这条原文已经较精炼，基础模式不建议为了改写而改写；可保留原文或启用模型获得更细致的表达建议。"],
      ...(requirement ? {
        requirementId: requirement.id,
        requirement: requirement.requirement,
        requirementStatus: requirement.status,
        evidence: requirement.evidence,
      } : { evidence: [] }),
    } satisfies RewriteProposal;
  });
}

export function finalizeModelRewriteProposals(
  rawProposals: RawRewriteProposal[],
  content: ResumeContent,
  section: AdvisorSection,
  jobFit?: JobFitResult,
  focus?: RewriteFocus,
): RewriteProposal[] {
  const sources = buildNarrativeSources(content, section);
  const finalized: RewriteProposal[] = [];
  const usedTargets = new Set<string>();

  for (const raw of rawProposals) {
    if (finalized.length >= 3) break;
    if (focus && !sameSourceRef(raw.sourceRef, focus.sourceRef)) continue;
    const source = sources.find((candidate) => sameSourceRef(candidate.sourceRef, raw.sourceRef));
    if (!source || raw.originalText.trim() !== source.text) continue;
    const targetKey = sourceRefKey(source.sourceRef);
    if (usedTargets.has(targetKey)) continue;

    const draftText = raw.draftText.trim();
    const missingFacts = raw.missingFacts.map((item) => item.trim()).filter(Boolean).slice(0, 4);
    if (!draftText || draftText.length > 800 || draftText === source.text) continue;
    if (hasNovelNumbers(source.text, draftText)
      || hasNovelClaimTokens(source.text, draftText)
      || !isApprovedDirectRewrite(source.text, draftText)) continue;

    const requirement = requirementForSource(jobFit, source.sourceRef, focus?.requirementId ?? raw.requirementId ?? undefined);
    const status = missingFacts.length || placeholderPattern.test(draftText) ? "needs-facts" : "ready";
    finalized.push({
      id: `model-${source.sourceRef.section}-${finalized.length + 1}`,
      generator: "model",
      status,
      sourceRef: source.sourceRef,
      originalText: source.text,
      draftText,
      rationale: raw.rationale.map((item) => item.trim()).filter(Boolean).slice(0, 3),
      missingFacts,
      ...(requirement ? {
        requirementId: requirement.id,
        requirement: requirement.requirement,
        requirementStatus: requirement.status,
        evidence: requirement.evidence,
      } : { evidence: [] }),
    });
    usedTargets.add(targetKey);
  }

  return finalized;
}

export function canApplyRewriteProposal(proposal: RewriteProposal) {
  return proposal.status === "ready"
    && proposal.missingFacts.length === 0
    && proposal.draftText.trim().length > 0
    && proposal.draftText.trim().length <= 800
    && !placeholderPattern.test(proposal.draftText)
    && !hasNovelNumbers(proposal.originalText, proposal.draftText)
    && !hasNovelClaimTokens(proposal.originalText, proposal.draftText)
    && isApprovedDirectRewrite(proposal.originalText, proposal.draftText);
}

export function applyRewriteProposal(content: ResumeContent, proposal: RewriteProposal) {
  if (!canApplyRewriteProposal(proposal)) return null;
  return replaceTextAtSourceRef(content, proposal.sourceRef, proposal.originalText, proposal.draftText.trim());
}

export function sameSourceRef(left: RewriteSourceRef, right: RewriteSourceRef) {
  return left.section === right.section
    && left.field === right.field
    && left.itemId === right.itemId
    && left.index === right.index;
}

function requirementForSource(jobFit: JobFitResult | undefined, sourceRef: RewriteSourceRef, preferredId?: string) {
  if (!jobFit) return undefined;
  const candidates = preferredId
    ? jobFit.items.filter((item) => item.id === preferredId)
    : jobFit.items;
  return candidates.find((item) => item.evidence.some((evidence) => (
    evidence.sourceRef && sameSourceRef(evidence.sourceRef, sourceRef)
  )));
}

function tightenText(value: string) {
  return value
    .trim()
    .replace(/^主要负责(?:了)?/, "负责")
    .replace(/^负责了/, "负责")
    .replace(/^参与了/, "参与")
    .replace(/^协助(?:进行了?|完成了?)/, "协助")
    .replace(/，并且/g, "，并")
    .replace(/\s{2,}/g, " ")
    .replace(/[；;]+$/, "。");
}

function hasNovelNumbers(originalText: string, draftText: string) {
  const original = new Set(extractNumbers(originalText));
  return extractNumbers(draftText).some((token) => !original.has(token));
}

function hasNovelClaimTokens(originalText: string, draftText: string) {
  const original = new Set(extractClaimTokens(originalText));
  return extractClaimTokens(draftText).some((token) => !original.has(token))
    || chineseClaimTerms.some((term) => draftText.includes(term) && !originalText.includes(term))
    || englishClaimTerms.some((term) => containsEnglishWord(draftText, term) && !containsEnglishWord(originalText, term))
    || extractNamedEntities(draftText).some((entity) => !originalText.includes(entity));
}

/**
 * Direct application is intentionally limited to the exact output of our
 * audited, deterministic compression rules. A general "deletion-only" rule is
 * not sufficient: deleting an unknown negation or attribution phrase could
 * still turn a true sentence into an overclaim. Model prose outside this
 * positive allowlist must never be written into the resume automatically.
 */
function isApprovedDirectRewrite(originalText: string, draftText: string) {
  const original = originalText.trim().normalize("NFKC");
  const approved = tightenText(originalText).normalize("NFKC");
  const draft = draftText.trim().normalize("NFKC");
  return approved !== original && draft === approved;
}

function extractNumbers(value: string) {
  return value.match(/\d+(?:[.,]\d+)?%?/g)?.map((token) => token.toLowerCase()) ?? [];
}

function extractClaimTokens(value: string) {
  const tokens = value.match(/\b[A-Za-z][A-Za-z0-9+.#-]{1,30}\b/g) ?? [];
  return tokens
    .filter((token) => knownClaimTokenPattern.test(token) || /[0-9+.#]/.test(token) || /^[A-Z]{2,12}$/.test(token))
    .map((token) => token.toLowerCase());
}

function extractNamedEntities(value: string) {
  return value.match(namedEntityPattern) ?? [];
}

function containsEnglishWord(value: string, word: string) {
  return new RegExp(`\\b${word}\\b`, "i").test(value);
}

function sourceRefKey(sourceRef: RewriteSourceRef) {
  return `${sourceRef.section}:${sourceRef.field}:${sourceRef.itemId ?? ""}:${sourceRef.index ?? ""}`;
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function findRequirement(jobFit: JobFitResult | undefined, requirementId?: string): JobFitItem | undefined {
  return requirementId ? jobFit?.items.find((item) => item.id === requirementId) : undefined;
}
