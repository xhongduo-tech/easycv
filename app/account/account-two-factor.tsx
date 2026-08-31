"use client";

import { useState } from "react";
import { KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-utils";
import styles from "./account.module.css";

export function AccountTwoFactor({ enabled, isAdmin, onChanged }: {
  enabled: boolean;
  isAdmin: boolean;
  onChanged: () => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [totpURI, setTotpURI] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function beginSetup() {
    setBusy(true); setNotice("");
    const result = await authClient.twoFactor.enable({
      ...(password ? { password } : {}), method: "totp", issuer: "简迹 CV",
    });
    setBusy(false);
    if (result.error) return setNotice(authErrorMessage(result.error.code, result.error.message));
    if (result.data?.method !== "totp") return setNotice("身份验证器设置未能初始化，请重试。");
    setTotpURI(result.data.totpURI);
    setBackupCodes(result.data.backupCodes);
  }

  async function verifySetup() {
    setBusy(true); setNotice("");
    const result = await authClient.twoFactor.verifyTotp({ code, trustDevice: false });
    setBusy(false);
    if (result.error) return setNotice(authErrorMessage(result.error.code, result.error.message));
    setTotpURI(""); setCode(""); setPassword("");
    setNotice("双重验证已启用；恢复码请保存在安全位置。");
    await onChanged();
  }

  async function disable() {
    setBusy(true); setNotice("");
    const result = await authClient.twoFactor.disable({ ...(password ? { password } : {}) });
    setBusy(false);
    if (result.error) return setNotice(authErrorMessage(result.error.code, result.error.message));
    setPassword(""); setBackupCodes([]); setNotice("双重验证已关闭。");
    await onChanged();
  }

  return <section className={styles.panel} id="two-factor">
    <header className={styles.panelTitle}><span><ShieldCheck size={19} /></span><div><h2>双重验证</h2><p>使用身份验证器保护登录；管理员账号必须保持启用。</p></div></header>
    <p className={enabled ? styles.securityEnabled : styles.unavailable}>{enabled ? "已启用 TOTP 双重验证" : "尚未启用双重验证"}</p>
    {!enabled && !totpURI && <div className={styles.twoFactorForm}><label className={styles.field}><span>当前密码（OAuth 账号可留空）</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><button className="button button-secondary" type="button" disabled={busy} onClick={() => void beginSetup()}>{busy ? <LoaderCircle className={styles.spin} size={16} /> : <KeyRound size={16} />} 开始设置</button></div>}
    {!enabled && totpURI && <div className={styles.twoFactorForm}><p className={styles.setupHint}>在身份验证器中导入下面的设置链接，再输入 6 位验证码完成绑定。</p><code className={styles.setupCode}>{totpURI}</code><label className={styles.field}><span>6 位验证码</span><input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} /></label><button className="button button-secondary" type="button" disabled={busy || code.length !== 6} onClick={() => void verifySetup()}>{busy ? <LoaderCircle className={styles.spin} size={16} /> : <ShieldCheck size={16} />} 验证并启用</button></div>}
    {enabled && !isAdmin && <div className={styles.twoFactorForm}><label className={styles.field}><span>当前密码（OAuth 账号可留空）</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label><button className="button button-secondary" type="button" disabled={busy} onClick={() => void disable()}>关闭双重验证</button></div>}
    {enabled && isAdmin && <p className={styles.setupHint}>管理员不能直接关闭双重验证；如需关闭，请先由另一位管理员撤销管理员角色。</p>}
    {backupCodes.length > 0 && <div className={styles.backupCodes}><strong>一次性恢复码</strong><p>每枚只能使用一次，请离线保存。</p><div>{backupCodes.map((item) => <code key={item}>{item}</code>)}</div></div>}
    {notice && <p className={styles.setupHint} role="status">{notice}</p>}
  </section>;
}
