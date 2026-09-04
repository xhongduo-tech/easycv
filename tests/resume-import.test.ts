import { describe, expect, it } from "vitest";
import { toPlainText, toPortableResumeJson } from "@/lib/resume-document";
import {
  createImageEvidenceDraft,
  getImportCapacityWarnings,
  mergeImportDrafts,
  mergeImportedContent,
  parseResumeImportJson,
  parseResumeImportText,
} from "@/lib/resume-import";
import { createBlankContent, createStarterContent } from "@/lib/sample-data";
import type { ResumeRecord } from "@/types/resume";

function fixture(): ResumeRecord {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    userId: "user-private",
    title: "产品简历",
    track: "career",
    targetName: "目标公司",
    templateId: "summit",
    status: "draft",
    progress: 100,
    revision: 3,
    content: createStarterContent("career"),
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

describe("resume local import", () => {
  it("round-trips the portable JSON backup without exposing the owner id", () => {
    const resume = fixture();
    resume.targetBrief = {
      resumeId: resume.id,
      kind: "career-job",
      focusName: "私密岗位",
      requirementsText: "不应进入简历备份的私密岗位描述",
      sourceType: "manual",
      capturedAt: "2026-09-01T00:00:00.000Z",
      revision: 1,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    };
    const json = toPortableResumeJson(resume);
    const draft = parseResumeImportJson(json, "backup.json");
    expect(json).not.toContain(resume.userId);
    expect(json).not.toContain("私密岗位描述");
    expect(draft.confidence).toBe("exact");
    expect(draft.content).toEqual(resume.content);
  });

  it("recognizes the platform plain-text export as a reviewable draft", () => {
    const resume = fixture();
    const draft = parseResumeImportText(toPlainText(resume), { sourceName: "resume.txt" });
    expect(draft.content.basics).toMatchObject({
      name: resume.content.basics.name,
      email: resume.content.basics.email,
      phone: resume.content.basics.phone,
    });
    expect(draft.content.education[0]).toMatchObject({
      school: resume.content.education[0].school,
      degree: resume.content.education[0].degree,
      major: resume.content.education[0].major,
    });
    expect(draft.content.experience[0]).toMatchObject({
      organization: resume.content.experience[0].organization,
      role: resume.content.experience[0].role,
    });
    expect(draft.content.projects[0].name).toBe(resume.content.projects[0].name);
    expect(draft.content.skills).toEqual(resume.content.skills);
    expect(draft.content.languages).toEqual(resume.content.languages);
    expect(draft.content.awards).toEqual(resume.content.awards);
    expect(draft.warnings[0]).toContain("候选稿");
  });

  it("recognizes common Markdown section heading styles", () => {
    const draft = parseResumeImportText([
      "# 林青",
      "产品设计师",
      "",
      "## 个人简介",
      "关注复杂工具的可用性。",
      "",
      "教育经历",
      "---",
      "示例大学 | 学士 · 设计 | 2020 — 2024 | 上海",
      "",
      "**技能:** Figma · 用户研究",
    ].join("\n"), { sourceName: "resume.md" });
    expect(draft.content.basics.name).toBe("林青");
    expect(draft.content.summary).toBe("关注复杂工具的可用性。");
    expect(draft.content.education[0]).toMatchObject({ school: "示例大学", location: "上海" });
    expect(draft.content.skills).toEqual(["Figma", "用户研究"]);
  });

  it("fills blank fields by default and only overwrites them after explicit opt-in", () => {
    const current = createStarterContent("career");
    const imported = createBlankContent();
    imported.basics.name = "导入姓名";
    imported.basics.website = "github.com/imported";
    imported.summary = "导入简介";
    imported.skills = ["TypeScript", "Rust"];

    const safeMerge = mergeImportedContent(current, imported);
    expect(safeMerge.basics.name).toBe(current.basics.name);
    expect(safeMerge.basics.website).toBe(current.basics.website);
    expect(safeMerge.summary).toBe(current.summary);
    expect(safeMerge.skills).toContain("Rust");
    expect(safeMerge.skills.filter((item) => item === "TypeScript")).toHaveLength(1);

    const replacement = mergeImportedContent(current, imported, { replaceExisting: true });
    expect(replacement.basics.name).toBe("导入姓名");
    expect(replacement.summary).toBe("导入简介");
  });

  it("marks multi-source conflicts for review instead of claiming an exact restore", () => {
    const firstContent = createStarterContent("career");
    const secondContent = structuredClone(firstContent);
    secondContent.basics.name = "另一姓名";
    secondContent.summary = "另一份个人简介";
    secondContent.experience[0].bullets = ["另一份来源中的描述"];
    const merged = mergeImportDrafts(
      parseResumeImportJson(JSON.stringify(firstContent), "first.json"),
      parseResumeImportJson(JSON.stringify(secondContent), "second.json"),
    );
    expect(merged.confidence).toBe("review");
    expect(merged.warnings.join("\n")).toMatch(/姓名.*不同/);
    expect(merged.warnings.join("\n")).toMatch(/个人简介.*不同/);
    expect(merged.warnings.join("\n")).toMatch(/同一条工作经历/);
  });

  it("keeps merged collections within the saved resume schema limits", () => {
    const current = createBlankContent();
    current.skills = Array.from({ length: 100 }, (_, index) => `current-${index}`);
    const imported = createBlankContent();
    imported.skills = ["new-skill"];
    expect(getImportCapacityWarnings(current, imported)[0]).toMatch(/技能超过 100 项上限/);
    expect(mergeImportedContent(current, imported).skills).toHaveLength(100);
  });

  it("warns when combining source drafts reaches a collection limit", () => {
    const first = createBlankContent();
    first.skills = Array.from({ length: 100 }, (_, index) => `first-${index}`);
    const second = createBlankContent();
    second.skills = ["overflow"];
    const draft = mergeImportDrafts(
      parseResumeImportJson(JSON.stringify(first), "first.json"),
      parseResumeImportJson(JSON.stringify(second), "second.json"),
    );
    expect(draft.content.skills).toHaveLength(100);
    expect(draft.warnings.join("\n")).toMatch(/技能超过 100 项上限/);
  });

  it("turns a locally reviewed image fact into text only", () => {
    const draft = createImageEvidenceDraft("全国竞赛一等奖\nAWS 认证", "awards", "certificate.png");
    expect(draft.content.awards).toEqual(["全国竞赛一等奖", "AWS 认证"]);
    expect(JSON.stringify(draft)).not.toContain("data:image");
    expect(draft.warnings[0]).toContain("不会上传或保存");
  });

  it("rejects malformed and incompatible JSON", () => {
    expect(() => parseResumeImportJson("{"))
      .toThrow(/无法解析/);
    expect(() => parseResumeImportJson(JSON.stringify({ content: { basics: {} } })))
      .toThrow(/结构不兼容/);
  });
});
