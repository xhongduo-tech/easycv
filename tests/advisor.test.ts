import { describe, expect, it } from "vitest";
import { createAdvice } from "@/lib/advisor";
import { createStarterContent, targetProfiles } from "@/lib/sample-data";

describe("target-aware local advisor", () => {
  it("returns deterministic, target-specific suggestions without inventing results", () => {
    const content = createStarterContent("career");
    content.experience[0].bullets = ["参与用户增长项目"];
    content.projects = [];
    content.education[0].highlights = [];
    content.education[0].score = "";
    const target = targetProfiles.find((item) => item.id === "tencent");

    const first = createAdvice(content, "career", target, "experience");
    const second = createAdvice(content, "career", target, "experience");

    expect(first).toEqual(second);
    expect(first.headline).toContain("经历");
    expect(first.keywords).toContain("用户价值");
    expect(first.suggestions.some((item) => item.id === "metric-density")).toBe(true);
    expect(first.rewrite).toContain("请核实后填写的结果");
  });

  it("rewards complete evidence while keeping the score below 100", () => {
    const content = createStarterContent("study");
    const target = targetProfiles.find((item) => item.id === "cambridge");
    const result = createAdvice(content, "study", target);

    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.score).toBeLessThan(100);
    expect(result.suggestions.length).toBeGreaterThanOrEqual(1);
  });
});
