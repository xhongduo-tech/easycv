"use client";

import { useState } from "react";
import { GraduationCap } from "lucide-react";
import { getTargetBrandPresentation } from "@/lib/target-brand-assets";
import type { Track } from "@/types/resume";
import styles from "./target-brand-mark.module.css";

export function TargetBrandMark({
  targetId,
  targetName,
  track,
  size = "medium",
  className = "",
}: {
  targetId?: string;
  targetName: string;
  track: Track;
  size?: "small" | "medium" | "large";
  className?: string;
}) {
  const [assetFailed, setAssetFailed] = useState(false);
  const presentation = getTargetBrandPresentation(targetId, targetName);
  const sizeClass = size === "medium" ? "" : styles[size];

  if (track === "study") {
    return (
      <span className={`${styles.mark} ${styles.study} ${sizeClass} ${className}`} aria-hidden="true">
        <GraduationCap size={size === "small" ? 13 : 17} />
      </span>
    );
  }

  if (presentation.kind === "asset" && !assetFailed) {
    return (
      <span className={`${styles.mark} ${sizeClass} ${className}`} aria-hidden="true">
        {/* Assets are local, rights-reviewed files; remote logo hotlinking is intentionally disallowed. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={presentation.asset.src} alt="" draggable={false} onError={() => setAssetFailed(true)} />
      </span>
    );
  }

  const fallback = presentation.kind === "neutral"
    ? presentation
    : getTargetBrandPresentation(undefined, targetName);

  return (
    <span
      className={`${styles.mark} ${sizeClass} ${className}`}
      data-tone={fallback.kind === "neutral" ? fallback.tone : "slate"}
      aria-hidden="true"
    >
      <span className={styles.monogram}>{fallback.kind === "neutral" ? fallback.label : "目标"}</span>
    </span>
  );
}
