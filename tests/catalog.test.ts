import { describe, expect, it } from "vitest";
import { targetCatalogGroups, targetProfiles, templates } from "@/lib/sample-data";
import { recommendedTemplateIdsFor } from "@/lib/target-catalog";

describe("target and layout catalogs", () => {
  it("covers a broad two-level university and employer catalog with unique ids", () => {
    const study = targetProfiles.filter((target) => target.track === "study");
    const career = targetProfiles.filter((target) => target.track === "career");
    const ids = targetProfiles.map((target) => target.id);

    expect(study.length).toBeGreaterThanOrEqual(100);
    expect(career.length).toBeGreaterThanOrEqual(80);
    expect(new Set(ids).size).toBe(ids.length);
    expect(study.some((target) => target.name === "清华大学")).toBe(true);
    expect(study.some((target) => target.name === "香港大学")).toBe(true);
    expect(career.some((target) => target.name === "高盛")).toBe(true);
    expect(career.find((target) => target.id === "goldman-sachs")?.region).toBe("全球");
    expect(career.find((target) => target.id === "cicc")?.region).toBe("中国");

    for (const group of targetCatalogGroups.study) {
      expect(study.some((target) => target.region === group.key)).toBe(true);
    }
    for (const group of targetCatalogGroups.career) {
      expect(career.some((target) => target.category === group.key)).toBe(true);
    }
  });

  it("keeps shared visual layouts compatible with every recommendation", () => {
    expect(templates.filter((template) => template.track === "study")).toHaveLength(8);
    expect(templates.filter((template) => template.track === "career")).toHaveLength(8);

    for (const target of targetProfiles) {
      const recommendations = recommendedTemplateIdsFor(target);
      expect(recommendations.length).toBeGreaterThanOrEqual(1);
      for (const id of recommendations) {
        expect(templates.some((template) => template.id === id && template.track === target.track)).toBe(true);
      }
    }
  });
});
