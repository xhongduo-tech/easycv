import { z } from "zod";
import { redactJobDescriptionForModel } from "@/lib/job-fit";
import { buildNarrativeSources, getTextAtSourceRef, replaceTextAtSourceRef } from "@/lib/rewrite-proposals";
import { resumeContentSchema } from "@/lib/validation";
import type { ResumeContent, RewriteSourceRef, TargetBrief, Track } from "@/types/resume";

const idSchema = z.string().min(1).max(80).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const text = (max: number) => z.string().trim().min(1).max(max);
const evidenceIdSchema = z.string().min(1).max(87).regex(/^(?:answer:)?[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/);
const sourceRefSchema = z.discriminatedUnion("section", [
  z.object({ section: z.literal("summary"), field: z.literal("summary") }).strict(),
  z.object({ section: z.literal("education"), field: z.literal("highlights"), itemId: text(100), index: z.number().int().min(0).max(29) }).strict(),
  z.object({ section: z.literal("experience"), field: z.literal("bullets"), itemId: text(100), index: z.number().int().min(0).max(29) }).strict(),
  z.object({ section: z.literal("projects"), field: z.literal("bullets"), itemId: text(100), index: z.number().int().min(0).max(29) }).strict(),
]);

export const agentAnswerSchema = z.object({
  questionId: idSchema,
  question: text(400),
  text: text(2_000),
}).strict();

const inputShape = z.object({
  schemaVersion: z.literal(1),
  track: z.enum(["career", "study"]),
  targetName: text(240),
  focusName: z.string().trim().max(160),
  requirementsText: z.string().trim().max(12_000),
  sources: z.array(z.object({
    id: idSchema,
    sourceRef: sourceRefSchema,
    // Preserve source bytes: trimming here would weaken the exact-text check.
    text: z.string().min(1).max(2_000),
    label: text(420),
  }).strict()).min(1).max(80),
  answers: z.array(agentAnswerSchema).max(9),
  language: z.literal("zh-CN"),
}).strict();

export const agentInputSchema = inputShape.superRefine((input, context) => {
  const fail = (message: string) => context.addIssue({ code: "custom", message });
  if (hasDuplicates(input.sources.map((source) => source.id))) fail("证据来源 ID 不能重复");
  if (hasDuplicates(input.sources.map((source) => sourceKey(source.sourceRef)))) fail("证据来源定位不能重复");
  if (hasDuplicates(input.answers.map((answer) => answer.questionId))) fail("补充答案的问题 ID 不能重复");
  if (input.sources.reduce((length, source) => length + source.text.length, 0) > 40_000) fail("证据正文总长度不能超过 40000 个字符");
  if (input.sources.some((source) => !source.text.trim())) fail("证据正文不能为空");
  const inputText = [input.targetName, input.focusName, input.requirementsText,
    ...input.sources.flatMap((source) => [source.text, source.label, source.sourceRef.section === "summary" ? "" : source.sourceRef.itemId]),
    ...input.answers.flatMap((answer) => [answer.question, answer.text])];
  if (inputText.some(containsContact)) fail("传入执行服务的文字必须先移除联系方式");
});

export const agentResultSchema = z.object({
  summary: text(1_200),
  questions: z.array(z.object({ id: idSchema, question: text(400), reason: text(600) }).strict()).max(3),
  proposals: z.array(z.object({
    id: idSchema,
    sourceId: idSchema,
    originalText: z.string().min(1).max(2_000),
    draftText: text(2_000),
    rationale: text(600),
    evidenceIds: z.array(evidenceIdSchema).min(1).max(12),
    warnings: z.array(text(240)).max(12),
  }).strict()).max(8),
  interview: z.array(z.object({
    question: text(400),
    answerOutline: text(2_000),
    evidenceIds: z.array(evidenceIdSchema).min(1).max(12),
  }).strict()).max(8),
}).strict();

// The runner uses the same structural contract; ownership and source checks are
// deliberately performed again by validateAgentResult on the business server.
export const agentResultJsonSchema = z.toJSONSchema(agentResultSchema, { target: "draft-7" });

export type AgentInput = z.infer<typeof agentInputSchema>;
export type AgentAnswer = z.infer<typeof agentAnswerSchema>;
export type AgentResult = z.infer<typeof agentResultSchema>;
export type AgentJobStatus = "queued" | "running" | "waiting_input" | "ready" | "applied" | "failed" | "cancelled" | "expired";
export interface AgentJob {
  id: string;
  resumeId: string;
  status: AgentJobStatus;
  version: number;
  baseResumeRevision: number;
  baseBriefRevision: number;
  input: AgentInput;
  result: AgentResult | null;
  error: string | null;
  stage: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  appliedRevision: number | null;
}
export interface AgentRuntime {
  enabled: boolean;
  reason: string | null;
  billingMode: "sponsored-preview";
  maxJobsPerDay: number;
}

const redactionMarker = /\[(?:邮箱|电话|联系人|联系账号)已隐藏\]/;
const manualReviewWarning = "必须人工确认：来源是用户提供的材料与回答，尚未经独立事实核验；请核对候选中的每项表述。";

/** Contact data never needs to reach the task executor, including inside prose. */
export function redactAgentText(value: string): string {
  return redactJobDescriptionForModel(value)
    .replace(/\[招聘联系邮箱已移除\]/g, "[邮箱已隐藏]")
    .replace(/\[招聘联系电话已移除\]/g, "[电话已隐藏]")
    .replace(/\[招聘联系人已移除\]/g, "[联系人已隐藏]")
    .replace(/\[招聘联系账号已移除\]/g, "[联系账号已隐藏]")
    .replace(/\b\d{3}[-. ]\d{3}[-. ]\d{4}\b|\(\d{3}\)\s*\d{3}[-. ]?\d{4}/g, "[电话已隐藏]");
}

export function buildAgentInput({ content, track, targetName, brief }: {
  content: ResumeContent;
  track: Track;
  targetName: string;
  brief?: Pick<TargetBrief, "focusName" | "requirementsText">;
}): AgentInput {
  resumeContentSchema.parse(content);
  assertUniqueContentItems(content);
  const sources: AgentInput["sources"] = [];
  let totalLength = 0;
  for (const source of buildNarrativeSources(content, "overview")) {
    // buildNarrativeSources trims for display; application must use the actual
    // saved source, including whitespace, to preserve exact replacement checks.
    const original = getTextAtSourceRef(content, source.sourceRef);
    if (original === null || !original.trim()) continue;
    const redactedText = redactAgentText(original);
    if (sources.length >= 80) throw new Error("本次经历描述超过 80 段，请精简后再创建材料任务");
    if (totalLength + redactedText.length > 40_000) throw new Error("本次证据正文超过 40000 个字符，请精简后再创建材料任务");
    sources.push({
      id: stableSourceId(source.sourceRef),
      sourceRef: source.sourceRef,
      text: redactedText,
      label: redactAgentText(source.label),
    });
    totalLength += redactedText.length;
  }
  return agentInputSchema.parse({
    schemaVersion: 1, track, targetName: redactAgentText(targetName),
    focusName: redactAgentText(brief?.focusName ?? ""),
    requirementsText: redactAgentText(brief?.requirementsText ?? ""),
    sources, answers: [], language: "zh-CN",
  });
}

/** Checks permitted references and exact originals; this is not fact verification. */
export function validateAgentResult(inputValue: AgentInput, value: unknown): AgentResult {
  const input = agentInputSchema.parse(inputValue);
  const result = agentResultSchema.parse(value);
  const sources = new Map(input.sources.map((source) => [source.id, source]));
  const allowedEvidence = new Set([...sources.keys(), ...input.answers.map((answer) => `answer:${answer.questionId}`)]);
  if (hasDuplicates(result.questions.map((question) => question.id))) throw new Error("追问 ID 不能重复");
  if (result.questions.some((question) => input.answers.some((answer) => answer.questionId === question.id))) throw new Error("追问 ID 不能复用已回答的问题");
  if (hasDuplicates(result.proposals.map((proposal) => proposal.id))) throw new Error("候选 ID 不能重复");
  if (hasDuplicates(result.proposals.map((proposal) => proposal.sourceId))) throw new Error("同一来源只能生成一个候选");
  if (!result.questions.length && !result.proposals.length && !result.interview.length) throw new Error("任务结果缺少追问或可审阅的材料");

  const outputText = [result.summary,
    ...result.questions.flatMap((question) => [question.question, question.reason]),
    ...result.proposals.flatMap((proposal) => [proposal.originalText, proposal.draftText, proposal.rationale, ...proposal.warnings]),
    ...result.interview.flatMap((item) => [item.question, item.answerOutline])];
  if (outputText.some(containsContact)) throw new Error("任务输出不能插入联系方式");
  if (outputText.some((entry) => /事实(?:已经|已)(?:核验|验证|认证)|(?:已经|已)(?:核验|验证)(?:属实|通过)/.test(entry))) {
    throw new Error("任务输出不能宣称事实已经通过核验");
  }

  const checkEvidence = (ids: string[]) => {
    if (hasDuplicates(ids)) throw new Error("证据引用不能重复");
    if (!ids.length || ids.some((id) => !allowedEvidence.has(id))) throw new Error("任务结果引用了未授权的证据");
  };
  for (const proposal of result.proposals) {
    const source = sources.get(proposal.sourceId);
    if (!source) throw new Error("候选引用了未知来源");
    if (proposal.originalText !== source.text) throw new Error("候选原文与授权来源不一致");
    if (redactionMarker.test(source.text) || redactionMarker.test(proposal.draftText)) throw new Error("含隐藏联系方式的原文不能直接应用改写，请先在编辑器整理该段文字");
    if (proposal.draftText === proposal.originalText) throw new Error("候选必须包含可审阅的修改");
    if (source.sourceRef.section !== "summary" && proposal.draftText.length > 800) throw new Error("经历候选不能超过 800 个字符");
    checkEvidence(proposal.evidenceIds);
    if (!proposal.evidenceIds.includes(proposal.sourceId)) throw new Error("候选必须引用自己的原文证据");
    proposal.warnings = [...new Set([...reviewWarnings(proposal.originalText, proposal.draftText), ...proposal.warnings])];
  }
  for (const item of result.interview) checkEvidence(item.evidenceIds);
  return agentResultSchema.parse(result);
}

/** Only explicit selected candidates are applied; the caller owns revision CAS. */
export function applyAgentProposals(content: ResumeContent, input: AgentInput, value: AgentResult, ids: string[]): ResumeContent {
  if (!ids.length || ids.length > 8 || hasDuplicates(ids)) throw new Error("请选择不重复的候选进行应用");
  assertUniqueContentItems(content);
  const result = validateAgentResult(input, value);
  const selected = ids.map((id) => {
    const proposal = result.proposals.find((item) => item.id === id);
    if (!proposal) throw new Error("选中的候选不存在");
    return proposal;
  });
  let next = content;
  for (const proposal of selected) {
    const source = input.sources.find((item) => item.id === proposal.sourceId)!;
    const replaced = replaceTextAtSourceRef(next, source.sourceRef, proposal.originalText, proposal.draftText);
    if (!replaced) throw new Error("简历原文已经变化，请重新生成候选");
    next = replaced;
  }
  return resumeContentSchema.parse(next);
}

function reviewWarnings(original: string, draft: string): string[] {
  const warnings = [manualReviewWarning];
  const numbers = (value: string): string[] => value.match(/\d+(?:[.,]\d+)*(?:\s*[%％])?|[零〇一二两三四五六七八九十百千万亿]+(?=\s*(?:个|人|次|年|月|日|天|项|组|倍|万元|%|％))/g) ?? [];
  if (numbers(draft).some((number) => !numbers(original).includes(number))) warnings.push("必须人工确认：候选新增或调整了数字，请核对数量、比例、单位和结果归属。");
  const roles = (value: string) => value.match(/独立|主导|牵头|负责|领导|带领|管理|参与|协助|共同|协作|指导|担任|任职|实习|经理|总监|负责人|工程师|研究员|未曾|没有|并非|\b(?:led|lead|owned|own|managed|manage|assisted|assist|supported|support|participated|collaborated|independently|under|not|never)\b/gi)?.map((role) => role.toLowerCase()).sort() ?? [];
  if (JSON.stringify([...new Set(roles(original))]) !== JSON.stringify([...new Set(roles(draft))])) warnings.push("必须人工确认：候选改变了角色、责任或归因表述，请核对个人贡献与团队贡献。");
  const dates = (value: string) => value.match(/(?:19|20)\d{2}(?:\s*[-/.年]\s*\d{1,2})?(?:\s*[-/.月]\s*\d{1,2})?\s*(?:日)?|[零〇一二两三四五六七八九十]+[年月日]|至今|目前|现在|\b(?:present|current|january|february|march|april|may|june|july|august|september|october|november|december)\b/gi)?.map((date) => date.trim().toLowerCase()).sort() ?? [];
  if (JSON.stringify(dates(original)) !== JSON.stringify(dates(draft))) warnings.push("必须人工确认：候选改变了时间表述，请核对日期、持续时间和经历顺序。");
  return warnings;
}

function containsContact(value: string) { return redactAgentText(value) !== value; }
function hasDuplicates(values: string[]) { return new Set(values).size !== values.length; }
function sourceKey(ref: RewriteSourceRef) { return ref.section === "summary" ? "summary" : JSON.stringify([ref.section, ref.itemId, ref.index]); }

function stableSourceId(ref: RewriteSourceRef) {
  // Two independent 32-bit lanes avoid exposing a user's item IDs in evidence
  // labels; duplicate IDs are still rejected by the input schema.
  const key = sourceKey(ref);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < key.length; index++) {
    first = Math.imul(first ^ key.charCodeAt(index), 0x01000193);
    second = Math.imul(second ^ key.charCodeAt(index), 0x85ebca6b);
  }
  return `src-${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

function assertUniqueContentItems(content: ResumeContent) {
  for (const items of [content.education, content.experience, content.projects]) {
    if (hasDuplicates(items.map((item) => item.id))) throw new Error("简历条目 ID 不能重复，请先整理原文");
  }
}
