"use client";

import { useEffect, useRef } from "react";
import { authClient } from "@/lib/auth-client";

export function AuthBootstrap() {
  const session = authClient.useSession();
  const claimedFor = useRef("");

  useEffect(() => {
    const userId = session.data?.user.id;
    if (!userId || claimedFor.current === userId) return;
    claimedFor.current = userId;
    void fetch("/api/auth/claim-guest", { method: "POST" })
      .then(async (response) => response.ok ? await response.json() as { claimed?: boolean } : null)
      .then((result) => {
        if (!result) {
          claimedFor.current = "";
          return;
        }
        if (result?.claimed) window.dispatchEvent(new CustomEvent("jianji:guest-claimed"));
      })
      .catch(() => { claimedFor.current = ""; });
  }, [session.data?.user.id]);

  return null;
}
