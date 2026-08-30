import { describe, expect, it } from "vitest";
import { createBlankContent, createStarterContent } from "@/lib/sample-data";
import { calculateProgress } from "@/lib/utils";

describe("resume starters", () => {
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
