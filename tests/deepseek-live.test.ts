import { describe, expect, it } from "vitest";
import { createDeepSeekAdvice, getDeepSeekAdvisorConfig } from "@/lib/deepseek-advisor";
import { createStarterContent } from "@/lib/sample-data";

const liveConfig = getDeepSeekAdvisorConfig(process.env);

describe.skipIf(!liveConfig)("DeepSeek live canary", () => {
  it("returns schema-valid advice for synthetic resume data", async () => {
    const result = await createDeepSeekAdvice({
      content: createStarterContent("career"),
      track: "career",
      targetName: "合成测试岗位",
      section: "summary",
    }, liveConfig!);

    expect(result.headline.length).toBeGreaterThan(0);
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.keywords.length).toBeGreaterThan(0);
    expect(result.rewriteProposals.every((proposal) => proposal.originalText.length > 0)).toBe(true);
  }, 30_000);
});
