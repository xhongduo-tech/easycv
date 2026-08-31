export type TargetBrandTone = "violet" | "slate" | "blue" | "mint" | "amber" | "rose";

export interface TargetBrandAsset {
  src: `/brands/targets/${string}.${"svg" | "png" | "webp"}`;
  kind: "mark" | "wordmark";
  sourceUrl: `https://${string}`;
  termsUrl: `https://${string}`;
  allowedUse: string;
  attribution?: string;
  reviewedAt: `${number}-${number}-${number}`;
  expiresAt?: `${number}-${number}-${number}`;
  assetHash: `sha256-${string}`;
  rightsBasis: "official-guidelines" | "written-permission";
}

/**
 * Only assets whose evidence clearly permits this commercial product context belong here.
 * An icon library, press kit, or downloadable media page is not sufficient by itself.
 */
export const approvedTargetBrandAssets: Readonly<Record<string, TargetBrandAsset>> = Object.freeze({});

export function getApprovedTargetBrandAsset(targetId: string | undefined): TargetBrandAsset | undefined {
  return targetId ? approvedTargetBrandAssets[targetId] : undefined;
}

const tones: TargetBrandTone[] = ["violet", "slate", "blue", "mint", "amber", "rose"];

function stableTone(value: string): TargetBrandTone {
  let hash = 0;
  for (const character of value) hash = ((hash * 31) + character.charCodeAt(0)) >>> 0;
  return tones[hash % tones.length];
}

function neutralLabel(targetId: string | undefined, targetName: string): string {
  const idParts = targetId?.split("-").filter(Boolean) ?? [];
  if (idParts.length > 1) return idParts.map((part) => part[0]).join("").slice(0, 3).toUpperCase();
  if (idParts.length === 1 && /^[a-z0-9]+$/i.test(idParts[0])) return idParts[0].slice(0, 2).toUpperCase();

  const visibleCharacters = Array.from(targetName.replace(/[\s·（）()]/g, ""));
  return visibleCharacters.slice(0, 2).join("").toUpperCase() || "目标";
}

export type TargetBrandPresentation =
  | { kind: "asset"; asset: TargetBrandAsset }
  | { kind: "neutral"; label: string; tone: TargetBrandTone };

export function getTargetBrandPresentation(
  targetId: string | undefined,
  targetName: string,
): TargetBrandPresentation {
  const asset = getApprovedTargetBrandAsset(targetId);
  if (asset) return { kind: "asset", asset };

  const identityKey = targetId || targetName || "target";
  return {
    kind: "neutral",
    label: neutralLabel(targetId, targetName),
    tone: stableTone(identityKey),
  };
}
