import { describe, expect, it } from "vitest";
import { exportQuerySchema, updateResumeSchema } from "@/lib/validation";

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
