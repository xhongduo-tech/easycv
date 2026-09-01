import { describe, expect, it } from "vitest";
import {
  AI_CREDIT_PACKS,
  AI_POINT_COST_ALLOWANCE_MICROS,
  calculateAiPointCharge,
  estimateDeepSeekCostMicros,
  isMeteredDeepSeekModel,
  publicCreditPacks,
  SIGNUP_AI_CREDITS,
} from "@/lib/pricing";
import { DEEPSEEK_INPUT_TOKEN_UPPER_BOUND } from "@/lib/deepseek-advisor";

describe("AI credit pricing", () => {
  it("keeps larger packs progressively cheaper without making them free", () => {
    const packs = publicCreditPacks();
    const unitPrices = packs.map((pack) => pack.priceFen / pack.credits);
    expect(AI_CREDIT_PACKS.map((pack) => pack.credits)).toEqual([100, 400, 1_000]);
    expect(unitPrices[1]).toBeLessThan(unitPrices[0]);
    expect(unitPrices[2]).toBeLessThan(unitPrices[1]);
    expect(packs.map((pack) => pack.savingPercent)).toEqual([0, 11.9, 29.4]);
    expect(packs.map((pack) => pack.unitPriceLabel)).toEqual(["¥0.099/点", "¥0.0873/点", "¥0.0699/点"]);
    expect(SIGNUP_AI_CREDITS).toBe(25);
  });

  it("estimates cost from the published DeepSeek V4 peak rates", () => {
    expect(estimateDeepSeekCostMicros("deepseek-v4-flash", {
      inputTokens: 8_000,
      cachedInputTokens: 0,
      outputTokens: 2_200,
    })).toBe(43_800);
    expect(estimateDeepSeekCostMicros("deepseek-v4-pro", {
      inputTokens: 8_000,
      cachedInputTokens: 0,
      outputTokens: 2_200,
    })).toBe(131_400);
    expect(estimateDeepSeekCostMicros("deepseek-v4-flash", {
      inputTokens: 8_000,
      cachedInputTokens: 4_000,
      outputTokens: 1_000,
    })).toBe(21_400);
    const conservativeFlashUpperBound = estimateDeepSeekCostMicros("deepseek-v4-flash", {
      inputTokens: DEEPSEEK_INPUT_TOKEN_UPPER_BOUND,
      cachedInputTokens: 0,
      outputTokens: 2_200,
    });
    const cheapestPointPriceMicros = Math.min(
      ...AI_CREDIT_PACKS.map((pack) => pack.priceFen * 10_000 / pack.credits),
    );
    expect(conservativeFlashUpperBound).toBe(169_800);
    expect(calculateAiPointCharge("deepseek-v4-flash", {
      inputTokens: DEEPSEEK_INPUT_TOKEN_UPPER_BOUND,
      cachedInputTokens: 0,
      outputTokens: 2_200,
    })).toBe(5);
    expect(calculateAiPointCharge("deepseek-v4-flash", {
      inputTokens: 8_000,
      cachedInputTokens: 0,
      outputTokens: 2_200,
    })).toBe(2);
    expect(AI_POINT_COST_ALLOWANCE_MICROS).toBeLessThan(cheapestPointPriceMicros / 2);
    expect(isMeteredDeepSeekModel("deepseek-v4-flash")).toBe(true);
    expect(isMeteredDeepSeekModel("deepseek-v4-pro")).toBe(false);
    expect(() => estimateDeepSeekCostMicros("unknown", {
      inputTokens: 1,
      cachedInputTokens: 0,
      outputTokens: 1,
    })).toThrow(/Unsupported/);
  });
});
