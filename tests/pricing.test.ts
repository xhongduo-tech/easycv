import { describe, expect, it } from "vitest";
import {
  AI_CREDIT_PACKS,
  estimateDeepSeekCostMicros,
  isOneCreditDeepSeekModel,
  publicCreditPacks,
  SIGNUP_AI_CREDITS,
} from "@/lib/pricing";

describe("AI credit pricing", () => {
  it("keeps larger packs progressively cheaper without making them free", () => {
    const packs = publicCreditPacks();
    const unitPrices = packs.map((pack) => pack.priceFen / pack.credits);
    expect(AI_CREDIT_PACKS.map((pack) => pack.credits)).toEqual([20, 80, 200]);
    expect(unitPrices[1]).toBeLessThan(unitPrices[0]);
    expect(unitPrices[2]).toBeLessThan(unitPrices[1]);
    expect(packs.map((pack) => pack.savingPercent)).toEqual([0, 11.9, 29.4]);
    expect(packs.map((pack) => pack.unitPriceLabel)).toEqual(["¥0.495/次", "¥0.436/次", "¥0.350/次"]);
    expect(SIGNUP_AI_CREDITS).toBe(5);
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
      inputTokens: 42_000,
      cachedInputTokens: 0,
      outputTokens: 2_200,
    });
    const cheapestUnitPriceMicros = Math.min(
      ...AI_CREDIT_PACKS.map((pack) => pack.priceFen * 10_000 / pack.credits),
    );
    expect(conservativeFlashUpperBound).toBe(145_800);
    expect(conservativeFlashUpperBound).toBeLessThan(cheapestUnitPriceMicros / 2);
    expect(isOneCreditDeepSeekModel("deepseek-v4-flash")).toBe(true);
    expect(isOneCreditDeepSeekModel("deepseek-v4-pro")).toBe(false);
  });
});
