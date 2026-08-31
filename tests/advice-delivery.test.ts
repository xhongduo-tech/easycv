import { describe, expect, it } from "vitest";
import { canCompleteAbandonedAdviceDelivery, mergeAdviceDeliveryState } from "@/lib/advice-delivery";

describe("advice delivery replay", () => {
  it("keeps immutable advice while replacing every live billing/capability field", () => {
    const replayed = mergeAdviceDeliveryState(JSON.stringify({
      score: 91,
      provider: "deepseek:deepseek-v4-flash",
      creditCharged: 1,
      creditBalance: 4,
      bonusCredits: 4,
      purchasedCredits: 0,
      nextExpiryAt: "2026-09-30T00:00:00.000Z",
      accountKind: "guest",
      modelAvailable: true,
    }), {
      creditBalance: 82,
      bonusCredits: 2,
      purchasedCredits: 80,
      nextExpiryAt: "2027-09-01T00:00:00.000Z",
      accountKind: "user",
    }, false);

    expect(replayed).toMatchObject({
      score: 91,
      provider: "deepseek:deepseek-v4-flash",
      creditCharged: 1,
      creditBalance: 82,
      bonusCredits: 2,
      purchasedCredits: 80,
      nextExpiryAt: "2027-09-01T00:00:00.000Z",
      accountKind: "user",
      modelAvailable: false,
    });
  });

  it("finishes a no-charge fallback after recovery committed but the worker died", () => {
    const now = new Date("2026-09-01T00:01:00.000Z");
    expect(canCompleteAbandonedAdviceDelivery(
      "abandoned",
      "__pending__",
      "2026-09-01T00:15:00.000Z",
      now,
    )).toBe(true);
    expect(canCompleteAbandonedAdviceDelivery(
      "abandoned",
      "{}",
      "2026-09-01T00:15:00.000Z",
      now,
    )).toBe(false);
    expect(canCompleteAbandonedAdviceDelivery(
      "abandoned",
      "__pending__",
      "2026-09-01T00:00:00.000Z",
      now,
    )).toBe(false);
  });
});
