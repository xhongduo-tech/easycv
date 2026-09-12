import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  agentInputSchema, agentResultJsonSchema, agentResultSchema, applyAgentProposals,
  buildAgentInput, redactAgentText, validateAgentResult,
  type AgentInput, type AgentResult,
} from "@/lib/agent-contract";
import { createStarterContent } from "@/lib/sample-data";

function fixture() {
  const content = createStarterContent("career");
  content.summary = "参与后台系统开发，完成权限配置模块。";
  content.experience[0].bullets = ["使用 SQL 分析用户数据。", "整理每周业务报告。"];
  const input = buildAgentInput({ content, track: "career", targetName: "后端工程师", brief: { focusName: "平台研发", requirementsText: "负责权限管理与业务系统开发" } });
  return { content, input };
}

function resultFor(input: AgentInput): AgentResult {
  const source = input.sources[0];
  return {
    summary: "根据已提供材料重组表达，请逐条核对后再使用。",
    questions: [],
    proposals: [{ id: "proposal-1", sourceId: source.id, originalText: source.text,
      draftText: "完成后台系统的权限配置模块开发。", rationale: "把具体模块放在叙述重点。",
      evidenceIds: [source.id], warnings: [] }],
    interview: [{ question: "你完成了哪些具体工作？", answerOutline: "说明权限配置模块的实现过程，以及自己承担的工作。", evidenceIds: [source.id] }],
  };
}

describe("Codex task evidence contract", () => {
  it("builds stable bounded narrative evidence without basics or contact details", () => {
    const { content } = fixture();
    content.basics.email = "private@example.com";
    content.basics.phone = "13812345678";
    content.summary = "联系 member@example.org，电话 +1 415-555-2671；完成权限模块。";
    const args = { content, track: "career" as const, targetName: "目标", brief: { focusName: "岗位", requirementsText: "请发邮件至 hiring@example.com，联系 13812345678。" } };
    const input = buildAgentInput(args);
    expect(input).not.toHaveProperty("basics");
    expect(JSON.stringify(input)).not.toMatch(/private@example|member@example|hiring@example|13812345678|415-555-2671/);
    expect(input.sources[0].text).toContain("[邮箱已隐藏]");
    expect(input.sources[0].text).toContain("[电话已隐藏]");
    expect(input.sources.map((source) => source.id)).toEqual(buildAgentInput(args).sources.map((source) => source.id));
    content.summary = "新的具体经历";
    expect(buildAgentInput(args).sources[0].id).toBe(input.sources[0].id);
  });

  it("accepts semantic rewrites with references and adds mandatory human review", () => {
    const { input } = fixture();
    const result = validateAgentResult(input, resultFor(input));
    expect(result.proposals[0].draftText).toBe("完成后台系统的权限配置模块开发。");
    expect(result.proposals[0].warnings.some((warning) => warning.includes("必须人工确认"))).toBe(true);
    expect(result.proposals[0].warnings.some((warning) => warning.includes("角色"))).toBe(true);
    expect(validateAgentResult(input, result)).toEqual(result);
  });

  it("rejects unauthorized sources, stale originals, missing evidence and arbitrary evidence IDs", () => {
    const { input } = fixture();
    for (const update of [
      { sourceId: "someone-elses-source" }, { originalText: "不同的原文" },
      { evidenceIds: [] }, { evidenceIds: ["answer:unknown"] },
      { evidenceIds: [input.sources[1].id] },
      { evidenceIds: [input.sources[0].id, input.sources[0].id] },
    ]) {
      const result = resultFor(input);
      Object.assign(result.proposals[0], update);
      expect(() => validateAgentResult(input, result)).toThrow();
    }
    const result = resultFor(input);
    result.interview[0].evidenceIds = ["not-authorized"];
    expect(() => validateAgentResult(input, result)).toThrow("未授权");
  });

  it("permits confirmed answers as evidence and flags numbers, role and date changes", () => {
    const { input } = fixture();
    input.answers.push({ questionId: "scope", question: "实现范围是什么？", text: "2025年独立完成权限模块，供3个业务组使用。" });
    const result = resultFor(input);
    result.proposals[0].draftText = "2025年独立完成权限配置模块，供3个业务组使用。";
    result.proposals[0].evidenceIds.push("answer:scope");
    result.interview[0].evidenceIds.push("answer:scope");
    const checked = validateAgentResult(input, result);
    expect(checked.proposals[0].warnings.join("\n")).toMatch(/数字/);
    expect(checked.proposals[0].warnings.join("\n")).toMatch(/角色/);
    expect(checked.proposals[0].warnings.join("\n")).toMatch(/时间/);
  });

  it("rejects reused question IDs and duplicate input/output IDs or source references", () => {
    const { input } = fixture();
    const duplicateSource = structuredClone(input);
    duplicateSource.sources.push({ ...duplicateSource.sources[0], id: "different-id" });
    expect(() => agentInputSchema.parse(duplicateSource)).toThrow();
    const duplicateId = structuredClone(input);
    duplicateId.sources[1].id = duplicateId.sources[0].id;
    expect(() => agentInputSchema.parse(duplicateId)).toThrow();
    input.answers = [{ questionId: "q1", question: "个人职责？", text: "完成模块开发。" }];
    const result = resultFor(input);
    result.questions = [{ id: "q1", question: "再说一次？", reason: "需要细节" }];
    expect(() => validateAgentResult(input, result)).toThrow("复用");
    input.answers.push({ ...input.answers[0] });
    expect(() => agentInputSchema.parse(input)).toThrow();
    input.answers = [];
    result.questions = [{ id: "q2", question: "个人职责？", reason: "需要细节" }, { id: "q2", question: "结果？", reason: "需要细节" }];
    expect(() => validateAgentResult(input, result)).toThrow("ID 不能重复");
    result.questions = [];
    result.proposals.push({ ...result.proposals[0], id: "proposal-2" });
    expect(() => validateAgentResult(input, result)).toThrow("同一来源");
    result.proposals[1].sourceId = input.sources[1].id;
    result.proposals[1].id = result.proposals[0].id;
    expect(() => validateAgentResult(input, result)).toThrow("候选 ID");
  });

  it("does not allow contact insertion or redacted source replacement", () => {
    const { input, content } = fixture();
    for (const contact of ["owner@example.com", "owner [at] example [dot] com", "13812345678", "+1 415-555-2671", "415-555-2671", "微信: person_123"]) {
      const result = resultFor(input);
      result.proposals[0].draftText += contact;
      expect(() => validateAgentResult(input, result)).toThrow("联系方式");
    }
    content.summary += "联系 owner@example.com。";
    const redactedInput = buildAgentInput({ content, track: "career", targetName: "研发" });
    expect(() => validateAgentResult(redactedInput, resultFor(redactedInput))).toThrow("隐藏联系方式");
    expect(redactAgentText("mail: x@example.com")).toBe("mail: [邮箱已隐藏]");
    input.answers.push({ questionId: "q1", question: "联系方式？", text: "user@example.com" });
    expect(() => agentInputSchema.parse(input)).toThrow("移除联系方式");
  });

  it("applies only selected candidates without mutating the source and rejects changed originals", () => {
    const { input, content } = fixture();
    const result = resultFor(input);
    const second = input.sources.find((source) => source.sourceRef.section === "experience")!;
    result.proposals.push({ id: "proposal-2", sourceId: second.id, originalText: second.text,
      draftText: "通过 SQL 完成用户数据分析。", rationale: "整理方法与动作。", evidenceIds: [second.id], warnings: [] });
    const next = applyAgentProposals(content, input, result, ["proposal-2"]);
    expect(next.summary).toBe(content.summary);
    expect(next.experience[0].bullets[0]).toBe("通过 SQL 完成用户数据分析。");
    expect(next.experience[0].bullets[1]).toBe(content.experience[0].bullets[1]);
    expect(content.experience[0].bullets[0]).toBe(second.text);
    expect(next.basics).toEqual(content.basics);
    expect(() => applyAgentProposals(content, input, result, ["absent"])).toThrow("不存在");
    expect(() => applyAgentProposals(content, input, result, [])).toThrow();
    expect(() => applyAgentProposals(content, input, result, ["proposal-1", "proposal-1"])).toThrow();
    content.experience[0].bullets[0] = "编辑器中已更新的内容";
    expect(() => applyAgentProposals(content, input, result, ["proposal-2"])).toThrow("原文已经变化");
  });

  it("rejects unknown fields, excessive output and unsupported fact verification claims", () => {
    const { input } = fixture();
    expect(() => validateAgentResult(input, { ...resultFor(input), verified: true })).toThrow();
    expect(() => validateAgentResult(input, { ...resultFor(input), summary: "x".repeat(1_201) })).toThrow();
    const questions = Array.from({ length: 4 }, (_, index) => ({ id: `q${index}`, question: "需要什么？", reason: "补充依据" }));
    expect(() => validateAgentResult(input, { ...resultFor(input), questions })).toThrow();
    expect(() => validateAgentResult(input, { ...resultFor(input), summary: "所有事实已核验。" })).toThrow("宣称");
    expect(() => agentInputSchema.parse({ ...input, privateEmail: "x@example.com" })).toThrow();
  });

  it("preserves exact originals including whitespace and produces a strict runner schema", () => {
    const { content } = fixture();
    content.summary = "  参与权限模块开发。  ";
    const input = buildAgentInput({ content, track: "career", targetName: "研发" });
    expect(input.sources[0].text).toBe(content.summary);
    const result = resultFor(input);
    result.proposals[0].originalText = content.summary.trim();
    expect(() => validateAgentResult(input, result)).toThrow("原文");
    expect(agentResultJsonSchema.additionalProperties).toBe(false);
    expect(agentResultSchema.safeParse(resultFor(input)).success).toBe(true);
    const runnerSchema = JSON.parse(readFileSync(new URL("../services/codex-runner/src/result-schema.json", import.meta.url), "utf8"));
    expect(runnerSchema).toEqual(agentResultJsonSchema);
  });

  it("bounds cumulative answers, input evidence and output materials", () => {
    const { content, input } = fixture();
    input.answers = Array.from({ length: 9 }, (_, index) => ({ questionId: `round-${index}`, question: "补充个人贡献？", text: "完成模块开发。" }));
    expect(agentInputSchema.safeParse(input).success).toBe(true);
    input.answers.push({ questionId: "extra", question: "更多？", text: "更多" });
    expect(agentInputSchema.safeParse(input).success).toBe(false);
    const result = resultFor(input);
    result.interview = Array.from({ length: 9 }, () => ({ ...result.interview[0] }));
    expect(agentResultSchema.safeParse(result).success).toBe(false);
    content.education = [];
    content.projects = [];
    content.experience = Array.from({ length: 20 }, (_, index) => ({ ...content.experience[0], id: `exp-${index}`, bullets: Array.from({ length: 30 }, () => "完成系统模块。".repeat(50)) }));
    expect(() => buildAgentInput({ content, track: "career", targetName: "研发" })).toThrow("超过 80 段");
    content.experience = content.experience.slice(0, 2).map((experience) => ({ ...experience, bullets: Array.from({ length: 30 }, () => "文".repeat(800)) }));
    expect(() => buildAgentInput({ content, track: "career", targetName: "研发" })).toThrow("超过 40000 个字符");
  });

  it("rejects duplicate source item IDs before any replacement can affect two entries", () => {
    const { input, content } = fixture();
    content.experience.push({ ...content.experience[0], bullets: [] });
    expect(() => buildAgentInput({ content, track: "career", targetName: "研发" })).toThrow("条目 ID");
    expect(() => applyAgentProposals(content, input, resultFor(input), ["proposal-1"])).toThrow("条目 ID");
  });
});
