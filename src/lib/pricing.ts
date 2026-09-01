export const SIGNUP_AI_CREDITS = 25;
export const GUEST_AI_TRIALS = 5;
export const PURCHASE_CREDIT_VALIDITY_DAYS = 365;
export const CREDIT_RESERVATION_TTL_MS = 2 * 60 * 1000;
// Payment-provider and merchant credentials are intentionally not simulated.
export const CHECKOUT_AVAILABLE = false;

/**
 * One Jianji point may carry at most ¥0.034 of normalized model cost. At the
 * cheapest public pack (¥69.9 / 1,000 points), this leaves just over 51% model
 * gross margin before payment, hosting, tax, support and failed-call costs.
 */
export const AI_POINT_COST_ALLOWANCE_MICROS = 34_000;
export const MAX_AI_POINTS_PER_REQUEST = 5;
export const AI_POINT_BILLING_VERSION = "jianji-points-v1-2026-09-01";

export const AI_CREDIT_PACKS = [
  {
    id: "light",
    name: "轻量包",
    credits: 100,
    priceFen: 990,
    description: "适合完成一份简历的主要章节精修",
  },
  {
    id: "standard",
    name: "标准包",
    credits: 400,
    priceFen: 3_490,
    description: "适合一个求职季的多岗位版本",
    badge: "推荐",
  },
  {
    id: "sprint",
    name: "冲刺包",
    credits: 1_000,
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
      unitPriceLabel: `${formatPointUnitPrice(unitPriceYuan)}/点`,
      savingPercent: Math.round((1 - unitPriceFen / baseline) * 1000) / 10,
    };
  });
}

export function formatYuan(priceFen: number) {
  const value = priceFen / 100;
  return `¥${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}`;
}

function formatPointUnitPrice(value: number) {
  return `¥${(value + 1e-10).toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}`;
}

export const DEEPSEEK_PRICE_VERSION = "deepseek-v4-peak-cny-2026-08-16";

export interface ModelTokenUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

// Integer tenths of a micro-yuan avoid floating-point drift at the ¥0.10 / M
// cached-input rate. Division happens once, at the final public unit boundary.
const peakRatesTenthsOfMicroYuan = {
  "deepseek-v4-flash": { inputMiss: 30, inputCache: 1, output: 90 },
  "deepseek-v4-flash-vision-exp": { inputMiss: 30, inputCache: 1, output: 90 },
  "deepseek-v4-pro": { inputMiss: 90, inputCache: 3, output: 270 },
} as const;

/** Public metered-point pricing is currently available only for text Flash. */
export function isMeteredDeepSeekModel(model: string) {
  return model === "deepseek-v4-flash";
}

/**
 * Returns estimated peak-time cost in micro-yuan. At a quoted RMB-per-million
 * token rate, each token costs the same numeric number of micro-yuan.
 */
export function estimateDeepSeekCostMicros(model: string, usage: ModelTokenUsage) {
  return Math.ceil(estimateDeepSeekCostTenthsOfMicroYuan(model, usage) / 10);
}

function estimateDeepSeekCostTenthsOfMicroYuan(model: string, usage: ModelTokenUsage) {
  const rates = peakRatesTenthsOfMicroYuan[model as keyof typeof peakRatesTenthsOfMicroYuan];
  if (!rates) throw new Error(`Unsupported DeepSeek pricing model: ${model}`);
  const inputTokens = positiveInteger(usage.inputTokens);
  const cachedInputTokens = Math.min(inputTokens, positiveInteger(usage.cachedInputTokens));
  const uncachedInputTokens = inputTokens - cachedInputTokens;
  return uncachedInputTokens * rates.inputMiss
    + cachedInputTokens * rates.inputCache
    + positiveInteger(usage.outputTokens) * rates.output;
}

/** Converts normalized peak-rate model cost into whole Jianji points. */
export function calculateAiPointCharge(model: string, usage: ModelTokenUsage) {
  return Math.max(
    1,
    Math.ceil(
      estimateDeepSeekCostTenthsOfMicroYuan(model, usage)
        / (AI_POINT_COST_ALLOWANCE_MICROS * 10),
    ),
  );
}

function positiveInteger(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}
