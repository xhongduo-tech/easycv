import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { targetProfiles } from "@/lib/sample-data";
import {
  approvedTargetBrandAssets,
  getApprovedTargetBrandAsset,
  getTargetBrandPresentation,
  isTargetBrandAssetCurrent,
  type TargetBrandAsset,
} from "@/lib/target-brand-assets";

describe("target brand asset gate", () => {
  it("gives every career target a safe visual presentation", () => {
    const careerTargets = targetProfiles.filter((target) => target.track === "career");
    expect(careerTargets.length).toBeGreaterThanOrEqual(80);

    for (const target of careerTargets) {
      const presentation = getTargetBrandPresentation(target.id, target.name);
      if (presentation.kind === "neutral") {
        expect(presentation.label.length).toBeGreaterThan(0);
        expect(presentation.label.length).toBeLessThanOrEqual(3);
      } else {
        expect(presentation.asset).toBe(approvedTargetBrandAssets[target.id]);
      }
    }
  });

  it("falls back for unknown or unreviewed targets", () => {
    expect(getApprovedTargetBrandAsset("unknown-employer")).toBeUndefined();
    expect(getTargetBrandPresentation("unknown-employer", "示例企业")).toMatchObject({
      kind: "neutral",
      label: "UE",
    });
  });

  it("keeps an approval through its expiry date and rejects it afterward", () => {
    const expiringAsset: TargetBrandAsset = {
      src: "/brands/targets/example.svg",
      kind: "mark",
      sourceUrl: "https://example.com/brand",
      termsUrl: "https://example.com/brand/terms",
      allowedUse: "Synthetic fixture for expiry policy testing only.",
      reviewedAt: "2026-08-01",
      expiresAt: "2026-09-01",
      assetHash: `sha256-${"0".repeat(64)}`,
      rightsBasis: "written-permission",
    };

    expect(isTargetBrandAssetCurrent(expiringAsset, new Date("2026-09-01T23:59:59.999Z"))).toBe(true);
    expect(isTargetBrandAssetCurrent(expiringAsset, new Date("2026-09-02T00:00:00.000Z"))).toBe(false);
  });

  it("only admits local, documented and safe assets", () => {
    const careerIds = new Set(targetProfiles.filter((target) => target.track === "career").map((target) => target.id));

    for (const [targetId, asset] of Object.entries(approvedTargetBrandAssets)) {
      expect(careerIds.has(targetId)).toBe(true);
      expect(asset.src).toMatch(/^\/brands\/targets\/[a-z0-9-]+\.(svg|png|webp)$/);
      expect(asset.src).not.toContain("..");
      expect(asset.sourceUrl).toMatch(/^https:\/\//);
      expect(asset.termsUrl).toMatch(/^https:\/\//);
      expect(asset.allowedUse.trim().length).toBeGreaterThan(10);
      expect(asset.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(asset.assetHash).toMatch(/^sha256-[a-f0-9]{64}$/);
      expect(["official-guidelines", "written-permission"]).toContain(asset.rightsBasis);

      const filePath = join(process.cwd(), "public", asset.src.slice(1));
      expect(existsSync(filePath)).toBe(true);
      const contents = readFileSync(filePath);
      expect(`sha256-${createHash("sha256").update(contents).digest("hex")}`).toBe(asset.assetHash);

      if (asset.src.endsWith(".svg")) {
        const svg = new TextDecoder().decode(contents);
        expect(svg).toMatch(/<svg\b/i);
        expect(svg).toMatch(/viewBox=/i);
        expect(svg).not.toMatch(/<script|foreignObject|\son\w+=|https?:\/\//i);
      }
    }
  });
});
