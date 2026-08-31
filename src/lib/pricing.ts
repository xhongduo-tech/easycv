export const SIGNUP_AI_CREDITS = 5;
export const GUEST_AI_TRIALS = 1;
export const PURCHASE_CREDIT_VALIDITY_DAYS = 365;
export const CREDIT_RESERVATION_TTL_MS = 2 * 60 * 1000;
// Payment-provider and merchant credentials are intentionally not simulated.
export const CHECKOUT_AVAILABLE = false;

export const AI_CREDIT_PACKS = [
  {
    id: "light",
    name: "轻量包",
    credits: 20,
    priceFen: 990,
    description: "完成一份简历的主要章节精修",
  },
  {
    id: "standard",
    name: "标准包",
    credits: 80,
    priceFen: 3_490,
    description: "适合一个求职季的多岗位版本",
    badge: "推荐",
  },
  {
    id: "sprint",
    name: "冲刺包",
    credits: 200,
    priceFen: 6_990,
    description: "适合密集投递与长期多版本迭代",
    badge: "单次更省",
  },
] as const;

export type AiCreditPackId = (typeof AI_CREDIT_PACKS)[number]["id"];

export interface PublicCreditPack {
  id: AiCreditPackId;
  name: string;
  credits: number;
  priceFen: number;
  priceLabel: string;
  unitPriceLabel: string;
  savingPercent: number;
  description: string;
  badge?: string;
}

export function publicCreditPacks(): PublicCreditPack[] {
  const baseline = AI_CREDIT_PACKS[0].priceFen / AI_CREDIT_PACKS[0].credits;
  return AI_CREDIT_PACKS.map((pack) => {
    const unitPriceFen = pack.priceFen / pack.credits;
    const unitPriceYuan = unitPriceFen / 100;
    return {
      ...pack,
      priceLabel: formatYuan(pack.priceFen),
      unitPriceLabel: `¥${(unitPriceYuan + 1e-9).toFixed(3)}/次`,
      savingPercent: Math.round((1 - unitPriceFen / baseline) * 1000) / 10,
    };
  });
}

export function formatYuan(priceFen: number) {
  const value = priceFen / 100;
  return `¥${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}`;
}

export const DEEPSEEK_PRICE_VERSION = "deepseek-v4-peak-cny-2026-08-16";

export interface ModelTokenUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

const peakRates = {
  "deepseek-v4-flash": { inputMiss: 3, inputCache: 0.1, output: 9 },
  "deepseek-v4-flash-vision-exp": { inputMiss: 3, inputCache: 0.1, output: 9 },
  "deepseek-v4-pro": { inputMiss: 9, inputCache: 0.3, output: 27 },
} as const;

/** The public one-credit price is costed only for the text Flash tier. */
export function isOneCreditDeepSeekModel(model: string) {
  return model === "deepseek-v4-flash";
}

/**
 * Returns estimated peak-time cost in micro-yuan. At a quoted RMB-per-million
 * token rate, each token costs the same numeric number of micro-yuan.
 */
export function estimateDeepSeekCostMicros(model: string, usage: ModelTokenUsage) {
  const rates = peakRates[model as keyof typeof peakRates] ?? peakRates["deepseek-v4-pro"];
  const inputTokens = positiveInteger(usage.inputTokens);
  const cachedInputTokens = Math.min(inputTokens, positiveInteger(usage.cachedInputTokens));
  const uncachedInputTokens = inputTokens - cachedInputTokens;
  return Math.round(
    uncachedInputTokens * rates.inputMiss
      + cachedInputTokens * rates.inputCache
      + positiveInteger(usage.outputTokens) * rates.output,
  );
}

function positiveInteger(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}
