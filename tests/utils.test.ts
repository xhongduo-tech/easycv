import { describe, expect, it } from "vitest";
import { calculateProgress } from "@/lib/utils";
import { createStarterContent } from "@/lib/sample-data";

describe("resume progress", () => {
  it("scores a fully seeded resume as complete", () => {
    expect(calculateProgress(createStarterContent("career"))).toBe(100);
  });

  it("drops when key evidence is missing", () => {
    const content = createStarterContent("study");
    content.summary = "";
    content.experience = [];
    content.skills = [];
    expect(calculateProgress(content)).toBeLessThan(75);
  });
});
