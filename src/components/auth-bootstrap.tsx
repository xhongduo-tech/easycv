"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function AuthBootstrap() {
  const router = useRouter();
  const session = authClient.useSession();
  const claimedFor = useRef("");

  useEffect(() => {
    const userId = session.data?.user.id;
    if (!userId || claimedFor.current === userId) return;
    claimedFor.current = userId;
    let cancelled = false;
    const claim = async () => {
      for (let attempt = 0; attempt < 13 && !cancelled; attempt += 1) {
        try {
          const acceptance = await fetch("/api/legal/acceptance", { cache: "no-store" });
          if (acceptance.status === 401) return;
          if (!acceptance.ok) {
            claimedFor.current = "";
            return;
          }
          const status = await acceptance.json() as { accepted?: boolean };
          if (!status.accepted) {
            const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
            const exempt = path.startsWith("/auth/")
              || path.startsWith("/account")
              || path.startsWith("/terms")
              || path.startsWith("/privacy");
            if (!exempt) {
              router.replace(`/auth/consent?returnTo=${encodeURIComponent(path)}`);
              router.refresh();
            }
            return;
          }
          const response = await fetch("/api/auth/claim-guest", { method: "POST" });
          const result = await response.json().catch(() => null) as {
            claimed?: boolean;
            error?: { code?: string; message?: string };
          } | null;
          if (result?.error?.code === "MODEL_REQUEST_ACTIVE") {
            await new Promise((resolve) => window.setTimeout(resolve, 3_000));
            continue;
          }
          if (result?.error?.code === "MFA_REQUIRED") {
            const path = `${window.location.pathname}${window.location.search}${window.location.hash}`;
            router.replace(`/auth/two-factor?returnTo=${encodeURIComponent(path)}`);
            router.refresh();
            return;
          }
          if (result?.error?.code === "RESOURCE_LIMIT_REACHED") {
            window.sessionStorage.setItem(
              "jianji:claim-error",
              result.error.message ?? "账号空间已满，请先整理已有简历后再合并访客草稿",
            );
            window.dispatchEvent(new CustomEvent("jianji:claim-error", {
              detail: result.error.message ?? "账号空间已满，请先整理已有简历后再合并访客草稿",
            }));
            return;
          }
          if (!response.ok || !result) {
            claimedFor.current = "";
            return;
          }
          if (result.claimed) window.dispatchEvent(new CustomEvent("jianji:guest-claimed"));
          return;
        } catch {
          claimedFor.current = "";
          return;
        }
      }
      if (!cancelled) claimedFor.current = "";
    };
    void claim();
    return () => { cancelled = true; };
  }, [router, session.data?.user.id]);

  return null;
}
