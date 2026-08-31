import { describe, expect, it } from "vitest";
import { analyzeJobFit } from "@/lib/job-fit";
import {
  applyRewriteProposal,
  canApplyRewriteProposal,
  createLocalRewriteProposals,
  finalizeModelRewriteProposals,
  getTextAtSourceRef,
  replaceTextAtSourceRef,
} from "@/lib/rewrite-proposals";
import { createStarterContent } from "@/lib/sample-data";
import type { RewriteSourceRef, TargetBrief } from "@/types/resume";

const targetBrief: TargetBrief = {
  resumeId: "resume-1",
  kind: "career-job",
  focusName: "数据分析师",
  requirementsText: "负责使用 SQL 完成用户数据分析",
  sourceType: "manual",
  capturedAt: "2026-08-31T00:00:00.000Z",
  revision: 1,
  createdAt: "2026-08-31T00:00:00.000Z",
  updatedAt: "2026-08-31T00:00:00.000Z",
};

describe("grounded rewrite proposals", () => {
  it("attaches a stable source reference to narrative evidence", () => {
    const content = createStarterContent("career");
    content.experience[0].bullets = ["主要负责使用 SQL 分析用户数据"];
    const fit = analyzeJobFit(content, targetBrief);

    expect(fit.items[0].evidence.find((item) => item.sourceRef)?.sourceRef).toEqual({
      section: "experience",
      field: "bullets",
      itemId: "exp-1",
      index: 0,
    });
  });

  it("creates a deterministic local draft without adding facts", () => {
    const content = createStarterContent("career");
    content.experience[0].bullets = ["主要负责使用 SQL 分析用户数据"];
    const fit = analyzeJobFit(content, targetBrief);
    const sourceRef: RewriteSourceRef = { section: "experience", field: "bullets", itemId: "exp-1", index: 0 };
    expect(fit.items[0].evidence.some((item) => item.sourceRef?.section === "experience")).toBe(true);
    const proposals = createLocalRewriteProposals(content, "experience", fit, {
      requirementId: fit.items[0].id,
      sourceRef,
    });

    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      status: "ready",
      originalText: "主要负责使用 SQL 分析用户数据",
      draftText: "负责使用 SQL 分析用户数据",
      requirementId: "requirement-1",
    });
    expect(canApplyRewriteProposal(proposals[0])).toBe(true);
  });

  it("rejects model drafts with invented facts, tools, numbers, or source references", () => {
    const content = createStarterContent("career");
    content.experience[0].bullets = ["主要负责使用 SQL 分析用户数据"];
    const fit = analyzeJobFit(content, targetBrief);
    const sourceRef: RewriteSourceRef = { section: "experience", field: "bullets", itemId: "exp-1", index: 0 };
    expect(fit.items[0].evidence.some((item) => item.sourceRef?.section === "experience")).toBe(true);
    const base = {
      sourceRef,
      originalText: content.experience[0].bullets[0],
      rationale: ["让动作更直接"],
      missingFacts: [],
      requirementId: fit.items[0].id,
    };

    expect(finalizeModelRewriteProposals([
      { ...base, draftText: "使用 SQL 分析用户数据，使转化率提升 30%" },
      { ...base, draftText: "使用 Python 与 SQL 分析用户数据" },
      { ...base, draftText: "主导使用 SQL 分析用户数据" },
      { ...base, draftText: "在示例科技公司使用 SQL 分析用户数据" },
      { ...base, draftText: "负责用户数据分析及财务预算编制" },
      { ...base, sourceRef: { ...sourceRef, index: 9 }, draftText: "使用 SQL 分析用户数据" },
    ], content, "experience", fit, { requirementId: fit.items[0].id, sourceRef })).toEqual([]);
  });

  it("rejects deletions that change unknown responsibility or attribution qualifiers", () => {
    const content = createStarterContent("career");
    const sourceRef: RewriteSourceRef = { section: "experience", field: "bullets", itemId: "exp-1", index: 0 };
    for (const [originalText, draftText] of [
      ["协助使用 SQL 分析用户数据", "使用 SQL 分析用户数据"],
      ["没有负责财务预算", "负责财务预算"],
      ["在导师指导下完成项目", "完成项目"],
    ]) {
      content.experience[0].bullets = [originalText];
      const fit = analyzeJobFit(content, targetBrief);
      expect(finalizeModelRewriteProposals([{
        sourceRef,
        originalText,
        draftText,
        rationale: ["压缩表达"],
        missingFacts: [],
        requirementId: fit.items[0].id,
      }], content, "experience", fit, { requirementId: fit.items[0].id, sourceRef })).toEqual([]);
    }
  });

  it("accepts a grounded model draft and replaces only the exact source line", () => {
    const content = createStarterContent("career");
    content.experience[0].bullets = ["主要负责使用 SQL 分析用户数据", "保留的第二条"];
    const fit = analyzeJobFit(content, targetBrief);
    const sourceRef: RewriteSourceRef = { section: "experience", field: "bullets", itemId: "exp-1", index: 0 };
    expect(fit.items[0].evidence.some((item) => item.sourceRef?.section === "experience")).toBe(true);
    const proposals = finalizeModelRewriteProposals([{
      sourceRef,
      originalText: "主要负责使用 SQL 分析用户数据",
      draftText: "负责使用 SQL 分析用户数据",
      rationale: ["删除冗余开头", "保留 SQL 与分析事实"],
      missingFacts: [],
      requirementId: fit.items[0].id,
    }], content, "experience", fit, { requirementId: fit.items[0].id, sourceRef });

    expect(proposals).toHaveLength(1);
    const updated = applyRewriteProposal(content, proposals[0]);
    expect(updated?.experience[0].bullets).toEqual(["负责使用 SQL 分析用户数据", "保留的第二条"]);
    expect(content.experience[0].bullets[0]).toBe("主要负责使用 SQL 分析用户数据");
  });

  it("refuses stale replacements and supports a precise inverse change", () => {
    const content = createStarterContent("career");
    const sourceRef: RewriteSourceRef = { section: "projects", field: "bullets", itemId: "project-1", index: 0 };
    const original = getTextAtSourceRef(content, sourceRef)!;
    const changed = replaceTextAtSourceRef(content, sourceRef, original, "精炼后的真实原文")!;

    expect(getTextAtSourceRef(changed, sourceRef)).toBe("精炼后的真实原文");
    expect(replaceTextAtSourceRef(changed, sourceRef, original, "不应应用")).toBeNull();
    const restored = replaceTextAtSourceRef(changed, sourceRef, "精炼后的真实原文", original)!;
    expect(getTextAtSourceRef(restored, sourceRef)).toBe(original);
  });
});
