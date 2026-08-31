import { describe, expect, it } from "vitest";
import { createBlankContent, createStarterContent, templates } from "@/lib/sample-data";
import { getTemplateDesignMeta } from "@/lib/template-system";
import { calculateProgress } from "@/lib/utils";

describe("resume starters", () => {
  it("maps the catalog to multiple professional design families", () => {
    const families = new Set(templates.map((template) => getTemplateDesignMeta(template.id).family));
    expect(families.size).toBeGreaterThanOrEqual(7);
    for (const template of templates) {
      const design = getTemplateDesignMeta(template.id);
      expect(design.rationale.length).toBeGreaterThan(20);
      expect(design.principles.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("creates a genuinely blank user document", () => {
    const content = createBlankContent();
    expect(content.basics.name).toBe("");
    expect(content.education).toEqual([]);
    expect(content.experience).toEqual([]);
    expect(calculateProgress(content)).toBe(0);
  });

  it("keeps fictional sample content separate for previews", () => {
    const sample = createStarterContent("career");
    expect(sample.basics.name).not.toBe("");
    expect(sample.experience.length).toBeGreaterThan(0);
  });
});
