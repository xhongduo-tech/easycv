export interface AdviceAccessState {
  creditBalance: number;
  bonusCredits: number;
  purchasedCredits: number;
  nextExpiryAt?: string | null;
  accountKind: "user" | "guest";
}

export function canCompleteAbandonedAdviceDelivery(
  attemptState: string,
  responseJson: string,
  expiresAt: string,
  now = new Date(),
) {
  return attemptState === "abandoned"
    && responseJson === "__pending__"
    && expiresAt > now.toISOString();
}

/**
 * A replay stores the immutable result of one model call. Balance, account
 * kind and current model availability are live state and must never be
 * restored from that snapshot.
 */
export function mergeAdviceDeliveryState(
  responseJson: string,
  access: AdviceAccessState,
  modelAvailable: boolean,
) {
  const payload = JSON.parse(responseJson) as Record<string, unknown>;
  delete payload.creditBalance;
  delete payload.bonusCredits;
  delete payload.purchasedCredits;
  delete payload.nextExpiryAt;
  delete payload.accountKind;
  delete payload.modelAvailable;
  return { ...payload, modelAvailable, ...access };
}
