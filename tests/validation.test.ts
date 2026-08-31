import { describe, expect, it } from "vitest";
import { exportQuerySchema, putTargetBriefSchema, recommendationRequestSchema, updateResumeSchema } from "@/lib/validation";

describe("resume update contract", () => {
  it("requires an expected revision", () => {
    expect(updateResumeSchema.safeParse({ title: "新标题" }).success).toBe(false);
  });

  it("accepts a revision-bound update", () => {
    expect(updateResumeSchema.safeParse({ title: "新标题", expectedRevision: 3 }).success).toBe(true);
  });
});

describe("export contract", () => {
  it("keeps public contact hidden unless explicitly enabled", () => {
    expect(exportQuerySchema.parse({ format: "github-pages" }).includeContact).toBe(false);
    expect(exportQuerySchema.parse({ format: "github-pages", includeContact: "true" }).includeContact).toBe(true);
  });
});

describe("recommendation contract", () => {
  it("requires an owned saved resume identifier", () => {
    expect(recommendationRequestSchema.safeParse({ section: "overview" }).success).toBe(false);
    expect(recommendationRequestSchema.safeParse({
      requestId: "8f239696-816d-4823-b06f-033ccdd25b57",
      resumeId: "d9428888-122b-4f48-9f9e-5ab869503e6d",
      section: "overview",
    }).success).toBe(true);
  });

  it("requires a valid requirement and narrative source pair for targeted rewriting", () => {
    const base = {
      requestId: "8f239696-816d-4823-b06f-033ccdd25b57",
      resumeId: "d9428888-122b-4f48-9f9e-5ab869503e6d",
      section: "experience" as const,
    };
    expect(recommendationRequestSchema.safeParse({ ...base, requirementId: "requirement-1" }).success).toBe(false);
    expect(recommendationRequestSchema.safeParse({
      ...base,
      requirementId: "requirement-1",
      sourceRef: { section: "experience", field: "bullets", itemId: "exp-1", index: 0 },
    }).success).toBe(true);
    expect(recommendationRequestSchema.safeParse({
      ...base,
      requirementId: "requirement-1",
      sourceRef: { section: "projects", field: "bullets", itemId: "project-1", index: 0 },
    }).success).toBe(false);
  });
});

describe("target brief contract", () => {
  const base = {
    expectedRevision: 0,
    focusName: "后端开发工程师",
    requirementsText: "负责服务端系统设计，熟悉 TypeScript 与 SQL。",
    sourceType: "employer-official" as const,
  };

  it("accepts only web source URLs", () => {
    expect(putTargetBriefSchema.safeParse({ ...base, sourceUrl: "https://careers.example.com/job/1" }).success).toBe(true);
    expect(putTargetBriefSchema.safeParse({ ...base, sourceUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(putTargetBriefSchema.safeParse({ ...base, sourceUrl: "file:///etc/passwd" }).success).toBe(false);
  });

  it("bounds job descriptions by characters and UTF-8 bytes", () => {
    expect(putTargetBriefSchema.safeParse({ ...base, requirementsText: "岗".repeat(10_001) }).success).toBe(false);
    expect(putTargetBriefSchema.safeParse({ ...base, requirementsText: "a".repeat(12_001) }).success).toBe(false);
  });
});
