"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { AuthShell } from "../auth-client";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-utils";
import { safeReturnTo } from "@/lib/auth-utils";
import styles from "../auth.module.css";

export function TwoFactorChallenge({ returnTo }: { returnTo?: string }) {
  const router = useRouter();
  const [method, setMethod] = useState<"totp" | "backup">("totp");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function verify(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const result = method === "totp"
      ? await authClient.twoFactor.verifyTotp({ code: code.trim(), trustDevice: false })
      : await authClient.twoFactor.verifyBackupCode({
          code: code.trim(),
          disableSession: false,
          trustDevice: false,
        });
    setBusy(false);
    if (result.error) {
      setError(authErrorMessage(result.error.code, result.error.message));
      return;
    }
    const stored = window.sessionStorage.getItem("jianji:mfa-return-to");
    window.sessionStorage.removeItem("jianji:mfa-return-to");
    router.push(safeReturnTo(returnTo ?? stored));
    router.refresh();
  }

  return <AuthShell><section className={styles.card} aria-labelledby="two-factor-title">
    <div className={styles.cardHeader}>
      <p>账号安全</p>
      <h1 id="two-factor-title">完成双重验证</h1>
      <span>输入身份验证器中的动态验证码，或使用一枚一次性恢复码。</span>
    </div>
    <div className={styles.tabs} role="tablist" aria-label="双重验证方式">
      <button type="button" role="tab" aria-selected={method === "totp"} onClick={() => { setMethod("totp"); setCode(""); setError(""); }}>动态验证码</button>
      <button type="button" role="tab" aria-selected={method === "backup"} onClick={() => { setMethod("backup"); setCode(""); setError(""); }}>恢复码</button>
    </div>
    {error && <div className={styles.formAlert} data-tone="error" role="alert">{error}</div>}
    <form className={styles.form} onSubmit={(event) => void verify(event)}>
      <label className={styles.field}>
        <span>{method === "totp" ? "6 位动态验证码" : "一次性恢复码"}</span>
        <div className={styles.inputShell}>
          <KeyRound size={17} />
          <input
            autoComplete="one-time-code"
            inputMode={method === "totp" ? "numeric" : "text"}
            value={code}
            onChange={(event) => setCode(method === "totp"
              ? event.target.value.replace(/\D/g, "").slice(0, 6)
              : event.target.value)}
            required
          />
        </div>
      </label>
      <button className="button button-primary" type="submit" disabled={busy || !code.trim()}>
        {busy ? <LoaderCircle className={styles.spin} size={17} /> : <ShieldCheck size={17} />}
        验证并继续
      </button>
    </form>
  </section></AuthShell>;
}
