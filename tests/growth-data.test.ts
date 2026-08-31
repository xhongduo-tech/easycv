import { describe, expect, it } from "vitest";
import { growthResources, recommendGrowthGaps, recommendGrowthResources } from "@/lib/growth-data";
import { createBlankContent } from "@/lib/sample-data";
import type { ResumeRecord } from "@/types/resume";

describe("growth route catalog", () => {
  it("uses traceable secure official resource links", () => {
    expect(growthResources.length).toBeGreaterThanOrEqual(12);
    expect(new Set(growthResources.map((item) => item.id))).toHaveProperty("size", growthResources.length);
    for (const resource of growthResources) {
      expect(resource.officialUrl.startsWith("https://")).toBe(true);
      expect(resource.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(resource.caveat.length).toBeGreaterThan(10);
    }
    expect(new Set(growthResources.map((item) => item.provider))).toEqual(expect.objectContaining({
      size: expect.any(Number),
    }));
    expect(growthResources.some((item) => item.provider === "中国大学 MOOC")).toBe(true);
    expect(growthResources.some((item) => item.provider === "Khan Academy")).toBe(true);
  });

  it("returns at most three distinct, target-aware priorities", () => {
    const resume: ResumeRecord = {
      id: "00000000-0000-4000-8000-000000000002",
      userId: "guest-test",
      title: "高盛分析岗",
      track: "career",
      targetName: "高盛 · 分析岗",
      templateId: "sterling",
      status: "draft",
      progress: 0,
      revision: 1,
      content: createBlankContent(),
      createdAt: "2026-08-30T00:00:00.000Z",
      updatedAt: "2026-08-30T00:00:00.000Z",
    };
    const result = recommendGrowthResources(resume);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result.length).toBeLessThanOrEqual(3);
    expect(result[0].area).toBe("business");
    expect(result[0].id).toBe("yale-financial-markets");
    expect(new Set(result.map((item) => item.area))).toHaveProperty("size", result.length);
  });

  it("uses the saved specialty label instead of sending a computer applicant to business basics", () => {
    const resume: ResumeRecord = {
      id: "00000000-0000-4000-8000-000000000003",
      userId: "guest-test",
      title: "麻省理工学院 · 硕士 · 计算机 / AI CV",
      track: "study",
      targetName: "麻省理工学院",
      templateId: "atlas",
      status: "draft",
      progress: 0,
      revision: 1,
      content: createBlankContent(),
      createdAt: "2026-08-30T00:00:00.000Z",
      updatedAt: "2026-08-30T00:00:00.000Z",
    };
    const result = recommendGrowthResources(resume);
    expect(result.map((item) => item.area)).toEqual(["data", "engineering", "communication"]);
    expect(result.some((item) => item.id === "wharton-business-foundations")).toBe(false);
    const gap = recommendGrowthGaps(resume);
    expect(gap).toHaveLength(1);
    expect(gap[0].resource.area).toBe("data");
    expect(gap[0].reason).toContain("尚未看到对应证据");
  });
});
