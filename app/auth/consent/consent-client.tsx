"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, FileCheck2, LoaderCircle, ShieldCheck } from "lucide-react";
import { CURRENT_LEGAL_DOCUMENTS } from "@/lib/legal-acceptance";
import { safeReturnTo } from "@/lib/auth-utils";
import { AuthShell } from "../auth-client";
import styles from "../auth.module.css";

export function ConsentClient({ returnTo }: { returnTo?: string }) {
  const router = useRouter();
  const destination = useMemo(() => safeReturnTo(returnTo), [returnTo]);
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [status, setStatus] = useState<"checking" | "ready" | "saving" | "error">("checking");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/legal/acceptance", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          router.replace(`/auth/login?returnTo=${encodeURIComponent(`/auth/consent?returnTo=${encodeURIComponent(destination)}`)}`);
          return null;
        }
        if (!response.ok) throw new Error("status");
        return await response.json() as { accepted: boolean };
      })
      .then((result) => {
        if (!active || !result) return;
        if (result.accepted) {
          router.replace(destination);
          router.refresh();
          return;
        }
        setStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setStatus("error");
        setMessage("暂时无法读取协议状态，请刷新后重试");
      });
    return () => { active = false; };
  }, [destination, router]);

  async function accept() {
    if (!terms || !privacy) return;
    setStatus("saving");
    setMessage("");
    try {
      const response = await fetch("/api/legal/acceptance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...CURRENT_LEGAL_DOCUMENTS,
          acceptTerms: true,
          acknowledgePrivacy: true,
        }),
      });
      if (!response.ok) throw new Error("acceptance");
      const claimResponse = await fetch("/api/auth/claim-guest", { method: "POST" });
      const claim = await claimResponse.json().catch(() => null) as {
        error?: { code?: string; message?: string };
      } | null;
      if (claim?.error?.code === "MFA_REQUIRED") {
        router.replace(`/auth/two-factor?returnTo=${encodeURIComponent(destination)}`);
        router.refresh();
        return;
      }
      if (claim?.error?.code === "RESOURCE_LIMIT_REACHED") {
        window.sessionStorage.setItem(
          "jianji:claim-error",
          claim.error.message ?? "账号空间已满，请整理已有简历后重试合并",
        );
      }
      router.replace(destination);
      router.refresh();
    } catch {
      setStatus("error");
      setMessage("确认未能保存，请稍后重试");
    }
  }

  return (
    <AuthShell>
      <section className={`${styles.card} ${styles.statusCard}`} aria-labelledby="consent-title">
        <span><FileCheck2 size={30} /></span>
        <p className="eyebrow">首次使用确认</p>
        <h1 id="consent-title">继续前请确认最新说明</h1>
        <p>我们会保存协议版本、账号和服务端确认时间；AI 内容处理仍会在每次增强优化前单独征得授权。</p>
        {message && <div className={styles.formAlert} data-tone="error" role="alert">{message}</div>}
        {status === "checking" ? (
          <p><LoaderCircle className={styles.spin} size={18} /> 正在读取协议状态</p>
        ) : (
          <div className={styles.form}>
            <label className={styles.agreement}>
              <input type="checkbox" checked={terms} onChange={(event) => setTerms(event.target.checked)} />
              <span>我已阅读并同意 <Link href="/terms" target="_blank">用户协议</Link></span>
            </label>
            <label className={styles.agreement}>
              <input type="checkbox" checked={privacy} onChange={(event) => setPrivacy(event.target.checked)} />
              <span>我已阅读并确认 <Link href="/privacy" target="_blank">隐私与 AI 说明</Link></span>
            </label>
            <button className="button button-primary" type="button" disabled={!terms || !privacy || status === "saving"} onClick={() => void accept()}>
              {status === "saving" ? <LoaderCircle className={styles.spin} size={17} /> : <ShieldCheck size={17} />}
              确认并继续 <ArrowRight size={16} />
            </button>
          </div>
        )}
      </section>
    </AuthShell>
  );
}
