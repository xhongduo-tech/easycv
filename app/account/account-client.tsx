"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Coins,
  Download,
  Github,
  KeyRound,
  Laptop,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Mail,
  Phone,
  QrCode,
  Save,
  ShieldCheck,
  Trash2,
  Unlink,
  UserRound,
} from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { authClient } from "@/lib/auth-client";
import type { AuthCapabilities } from "@/lib/auth-notifications";
import { authErrorMessage, normalizeMainlandPhone, passwordIssue } from "@/lib/auth-utils";
import type { PublicCreditPack } from "@/lib/pricing";
import { AccountTwoFactor } from "./account-two-factor";
import styles from "./account.module.css";

type AccountRecord = { id: string; providerId: string; accountId: string; createdAt: Date };
type SessionRecord = { id: string; token: string; userAgent?: string | null; ipAddress?: string | null; createdAt: Date; expiresAt: Date };
type Message = { tone: "success" | "error" | "info"; text: string } | null;
type BillingState = {
  accountKind: "user" | "guest";
  balance: { total: number; bonus: number; purchased: number; nextExpiryAt: string | null };
  packs: PublicCreditPack[];
  checkoutAvailable: boolean;
};

export function AccountClient() {
  const router = useRouter();
  const viewer = authClient.useSession();
  const user = viewer.data?.user as (NonNullable<typeof viewer.data>["user"] & {
    phoneNumber?: string | null;
    phoneNumberVerified?: boolean;
    twoFactorEnabled?: boolean;
    role?: string | null;
  }) | undefined;
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [capabilities, setCapabilities] = useState<AuthCapabilities | null>(null);
  const [billing, setBilling] = useState<BillingState | null>(null);
  const [billingStatus, setBillingStatus] = useState<"loading" | "ready" | "error">("loading");
  const [name, setName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [normalizedPhone, setNormalizedPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [phoneStage, setPhoneStage] = useState<"number" | "otp">("number");
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState("");

  const loadSecurity = useCallback(async () => {
    setBillingStatus("loading");
    const securityTask = Promise.all([
      authClient.listAccounts(),
      authClient.listSessions(),
      fetch("/api/auth/providers").then(async (response) => await response.json() as AuthCapabilities),
    ]).then(([accountResult, sessionResult, capabilityResponse]) => {
      if (accountResult.data) setAccounts(accountResult.data as AccountRecord[]);
      if (sessionResult.data) setSessions(sessionResult.data as SessionRecord[]);
      setCapabilities(capabilityResponse);
    });
    const billingTask = fetch("/api/billing")
      .then(async (response) => {
        if (!response.ok) throw new Error("额度读取失败");
        setBilling(await response.json() as BillingState);
        setBillingStatus("ready");
      })
      .catch(() => {
        setBilling(null);
        setBillingStatus("error");
      });
    await Promise.allSettled([securityTask, billingTask]);
  }, []);

  useEffect(() => {
    if (!user) return;
    // Authentication data is refreshed after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(user.name);
    void loadSecurity();
  }, [loadSecurity, user]);

  async function updateProfile(event: FormEvent) {
    event.preventDefault(); setBusy("profile"); setMessage(null);
    const result = await authClient.updateUser({ name: name.trim() });
    setBusy("");
    if (result.error) return showError(result.error);
    setMessage({ tone: "success", text: "个人资料已更新" });
    await viewer.refetch();
  }

  async function changeEmail(event: FormEvent) {
    event.preventDefault(); setBusy("email"); setMessage(null);
    const result = await authClient.changeEmail({ newEmail: newEmail.trim(), callbackURL: "/account?emailChanged=1" });
    setBusy("");
    if (result.error) return showError(result.error);
    setNewEmail("");
    setMessage({ tone: "success", text: "确认邮件已发送；完成确认后新邮箱才会生效" });
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault(); setMessage(null);
    const issue = passwordIssue(newPassword);
    if (issue) return setMessage({ tone: "error", text: issue });
    if (newPassword !== confirmPassword) return setMessage({ tone: "error", text: "两次输入的新密码不一致" });
    setBusy("password");
    const result = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
    setBusy("");
    if (result.error) return showError(result.error);
    setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    setMessage({ tone: "success", text: "密码已更新，其他设备的会话已撤销" });
    void loadSecurity();
  }

  async function sendPhoneCode() {
    const normalized = normalizeMainlandPhone(phone);
    if (!normalized) return setMessage({ tone: "error", text: "请输入有效的中国大陆手机号" });
    setBusy("phone"); setMessage(null);
    const result = await authClient.phoneNumber.sendOtp({ phoneNumber: normalized });
    setBusy("");
    if (result.error) return showError(result.error);
    setNormalizedPhone(normalized); setPhoneStage("otp");
    setMessage({ tone: "success", text: "验证码已发送，请在 5 分钟内完成验证" });
  }

  async function verifyPhone() {
    setBusy("phone"); setMessage(null);
    const result = await authClient.phoneNumber.verify({ phoneNumber: normalizedPhone, code: otp, updatePhoneNumber: true });
    setBusy("");
    if (result.error) return showError(result.error);
    setPhoneStage("number"); setPhone(""); setOtp("");
    setMessage({ tone: "success", text: "手机号已绑定，可用于验证码登录" });
    await viewer.refetch();
  }

  async function linkProvider(provider: "google" | "github" | "wechat") {
    setBusy(`link-${provider}`); setMessage(null);
    const result = await authClient.linkSocial({ provider, callbackURL: "/account?linked=1" });
    if (result?.error) { setBusy(""); showError(result.error); }
  }

  async function unlinkAccount(account: AccountRecord) {
    setBusy(account.id); setMessage(null);
    const result = await authClient.unlinkAccount({ accountId: account.id });
    setBusy("");
    if (result.error) return showError(result.error);
    setMessage({ tone: "success", text: `${providerLabel(account.providerId)} 已解除绑定` });
    void loadSecurity();
  }

  async function revokeSession(token: string) {
    setBusy(token); setMessage(null);
    const result = await authClient.revokeSession({ token });
    setBusy("");
    if (result.error) return showError(result.error);
    setSessions((current) => current.filter((item) => item.token !== token));
    setMessage({ tone: "success", text: "该设备的会话已撤销" });
  }

  async function revokeOthers() {
    setBusy("sessions"); setMessage(null);
    const result = await authClient.revokeOtherSessions();
    setBusy("");
    if (result.error) return showError(result.error);
    setMessage({ tone: "success", text: "其他设备已全部退出登录" });
    void loadSecurity();
  }

  async function deleteAccount() {
    if (deleteConfirm !== "删除账号") return setMessage({ tone: "error", text: "请输入“删除账号”完成确认" });
    setBusy("delete"); setMessage(null);
    const result = await authClient.deleteUser({ ...(deletePassword ? { password: deletePassword } : {}), callbackURL: "/" });
    setBusy("");
    if (result.error) return showError(result.error);
    router.push("/"); router.refresh();
  }

  async function downloadAccountData() {
    setBusy("export"); setMessage(null);
    try {
      const response = await fetch("/api/account/export", { method: "POST" });
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { error?: { message?: string } } | null;
        throw new Error(result?.error?.message ?? "账号数据导出失败");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `jianji-account-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setMessage({ tone: "success", text: "账号数据包已下载" });
    } catch (reason) {
      setMessage({ tone: "error", text: (reason as Error).message });
    } finally {
      setBusy("");
    }
  }

  function showError(error: { code?: string; message?: string }) {
    setMessage({ tone: "error", text: authErrorMessage(error.code, error.message) });
  }

  if (viewer.isPending) return <AccountState loading />;
  if (!user) return <AccountState />;
  const currentToken = viewer.data?.session.token;

  return (
    <main className={styles.page}>
      <SiteHeader />
      <section className={styles.accountShell}>
        <div className="shell">
          <header className={styles.heading}><div><p className="eyebrow">账号中心</p><h1>账号与安全</h1><p>管理个人资料、登录方式和已登录设备。</p></div><span><ShieldCheck size={18} /> 安全状态正常</span></header>
          {message && <div className={styles.message} data-tone={message.tone} role={message.tone === "error" ? "alert" : "status"}>{message.text}</div>}
          <nav className={styles.anchorNav} aria-label="账号设置"><a href="#credits">增强额度</a><a href="#profile">个人资料</a><a href="#connections">登录方式</a><a href="#security">密码与邮箱</a><a href="#two-factor">双重验证</a><a href="#sessions">设备会话</a><a href="#data">我的数据</a><a href="#danger">删除账号</a></nav>

          <div className={styles.settingsGrid}>
            <section id="credits" className={`${styles.panel} ${styles.widePanel} ${styles.creditPanel}`}>
              <PanelTitle icon={Coins} title="DeepSeek 增强优化额度" text="基础编辑、模板、检查与导出始终免费；只有成功的增强优化才扣 1 次。" />
              {billingStatus === "ready" && billing ? <div className={styles.creditLayout}>
                <div className={styles.balanceCard}>
                  <span>当前可用</span>
                  <strong>{billing.balance.total}<small>次</small></strong>
                  <p>赠送 {billing.balance.bonus} 次 · 已购 {billing.balance.purchased} 次</p>
                  <small>{billing.balance.nextExpiryAt
                    ? `最近一批付费额度 ${new Date(billing.balance.nextExpiryAt).toLocaleDateString("zh-CN")} 到期`
                    : "赠送额度当前不设期限"}</small>
                  <Link href="/pricing">查看完整规则 <ArrowRight size={14} /></Link>
                </div>
                <div className={styles.accountPacks}>
                  {billing.packs.map((pack) => <article key={pack.id} data-featured={pack.id === "standard"}>
                    <div><strong>{pack.name}</strong>{pack.badge && <span>{pack.badge}</span>}</div>
                    <p><b>{pack.priceLabel}</b><span>{pack.credits} 次 · {pack.unitPriceLabel}</span></p>
                    <button type="button" disabled aria-label={`${pack.name}支付暂未开放`}>暂未开放</button>
                  </article>)}
                </div>
              </div> : billingStatus === "error" ? (
                <div className={styles.creditLoading} role="alert">额度暂时无法读取。<button type="button" onClick={() => void loadSecurity()}>重试</button></div>
              ) : <div className={styles.creditLoading}><LoaderCircle className={styles.spin} size={18} /> 正在读取额度</div>}
              <p className={styles.creditCaveat}><ShieldCheck size={15} />模型失败、超时、繁忙或回退基础分析时不会扣额度；额度包不自动续费。</p>
            </section>

            <section id="profile" className={styles.panel}><PanelTitle icon={UserRound} title="个人资料" text="用于账号菜单和简历工作区，不会自动写入简历正文。" /><form onSubmit={(event) => void updateProfile(event)}><Field label="姓名或称呼" value={name} onChange={setName} autoComplete="name" /><div className={styles.readonlyField}><span>当前账号</span><strong>{displayEmail(user.email)}</strong><small>{user.emailVerified ? "已验证" : "待验证"}</small></div><button className="button button-primary" type="submit" disabled={busy === "profile"}>{busy === "profile" ? <LoaderCircle className={styles.spin} size={16} /> : <Save size={16} />} 保存资料</button></form></section>

            <section id="connections" className={styles.panel}><PanelTitle icon={Link2} title="登录方式" text="主动绑定其他方式后，可以任选一种登录同一账号。" /><div className={styles.connectionList}>
              {(["google", "github", "wechat"] as const).map((provider) => {
                const linked = accounts.find((account) => account.providerId === provider);
                const enabled = Boolean(capabilities?.[provider]);
                return <div key={provider}><span className={styles.connectionIcon}>{provider === "github" ? <Github size={18} /> : provider === "wechat" ? <QrCode size={18} /> : "G"}</span><div><strong>{providerLabel(provider)}</strong><small>{linked ? "已绑定" : enabled ? "可绑定" : "服务待配置"}</small></div>{linked ? <button type="button" disabled={busy === linked.id} onClick={() => void unlinkAccount(linked)}><Unlink size={14} /> 解绑</button> : <button type="button" disabled={!enabled || Boolean(busy)} onClick={() => void linkProvider(provider)}><Link2 size={14} /> 绑定</button>}</div>;
              })}
              {accounts.some((account) => account.providerId === "credential") && <div><span className={styles.connectionIcon}><Mail size={18} /></span><div><strong>邮箱密码</strong><small>已启用</small></div><span className={styles.connected}><CheckCircle2 size={14} /> 已绑定</span></div>}
            </div></section>

            <section className={styles.panel}><PanelTitle icon={Phone} title="中国大陆手机号" text="绑定后可使用短信验证码登录，也可用于手机号找回密码。" /><div className={styles.phoneStatus}>{user.phoneNumberVerified && user.phoneNumber ? <span><CheckCircle2 size={15} /> 已绑定 {maskPhone(user.phoneNumber)}</span> : <span>尚未绑定手机号</span>}</div>{capabilities?.phone ? <div className={styles.phoneForm}><Field label="手机号" value={phone} onChange={setPhone} type="tel" autoComplete="tel-national" disabled={phoneStage === "otp"} placeholder="138 0000 0000" />{phoneStage === "otp" && <Field label="验证码" value={otp} onChange={(value) => setOtp(value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" />}<button className="button button-secondary" type="button" disabled={busy === "phone"} onClick={() => void (phoneStage === "number" ? sendPhoneCode() : verifyPhone())}>{busy === "phone" ? <LoaderCircle className={styles.spin} size={16} /> : <KeyRound size={16} />}{phoneStage === "number" ? "发送验证码" : "验证并绑定"}</button></div> : <p className={styles.unavailable}>短信通道将在腾讯云短信签名和模板配置完成后开放。</p>}</section>

            <section id="security" className={styles.panel}><PanelTitle icon={LockKeyhole} title="密码与邮箱" text="修改密码会撤销其他设备会话；修改邮箱需要再次确认。" /><form onSubmit={(event) => void changeEmail(event)}><Field label="新邮箱" value={newEmail} onChange={setNewEmail} type="email" autoComplete="email" placeholder="new@example.com" /><button className="button button-secondary" type="submit" disabled={!capabilities?.email || busy === "email"}><Mail size={16} /> 发送邮箱确认</button></form><div className={styles.panelDivider} /><form onSubmit={(event) => void changePassword(event)}><Field label="当前密码" value={currentPassword} onChange={setCurrentPassword} type="password" autoComplete="current-password" /><Field label="新密码" hint="至少 12 位，包含字母和数字" value={newPassword} onChange={setNewPassword} type="password" autoComplete="new-password" /><Field label="确认新密码" value={confirmPassword} onChange={setConfirmPassword} type="password" autoComplete="new-password" /><button className="button button-secondary" type="submit" disabled={busy === "password"}><LockKeyhole size={16} /> 更新密码</button></form></section>

            <AccountTwoFactor enabled={Boolean(user.twoFactorEnabled)} isAdmin={user.role === "admin"} onChanged={async () => { await viewer.refetch(); }} />

            <section id="sessions" className={`${styles.panel} ${styles.widePanel}`}><PanelTitle icon={Laptop} title="已登录设备" text="发现不认识的设备时，立即撤销对应会话并修改密码。" /><div className={styles.sessionList}>{sessions.map((item) => <div key={item.id}><span><Laptop size={19} /></span><div><strong>{deviceName(item.userAgent)}</strong><small>{item.ipAddress ?? "IP 未记录"} · {new Date(item.createdAt).toLocaleString("zh-CN")}</small></div>{item.token === currentToken ? <span className={styles.currentSession}>当前设备</span> : <button type="button" disabled={busy === item.token} onClick={() => void revokeSession(item.token)}>退出</button>}</div>)}</div>{sessions.length > 1 && <button className="button button-secondary" type="button" disabled={busy === "sessions"} onClick={() => void revokeOthers()}>退出其他所有设备</button>}</section>

            <section id="data" className={`${styles.panel} ${styles.widePanel}`}><PanelTitle icon={Download} title="下载我的数据" text="导出账号资料、全部简历与版本、协议记录和额度流水；不会包含密码、令牌或双重验证密钥。" /><button className="button button-secondary" type="button" disabled={busy === "export"} onClick={() => void downloadAccountData()}>{busy === "export" ? <LoaderCircle className={styles.spin} size={16} /> : <Download size={16} />} 下载 JSON 数据包</button></section>

            <section id="danger" className={`${styles.panel} ${styles.dangerPanel} ${styles.widePanel}`}><PanelTitle icon={Trash2} title="删除账号与个人数据" text="将永久删除简历、版本记录、账号身份和会话，操作不可恢复。" /><div className={styles.dangerForm}><Field label="账号密码（仅邮箱密码账号需要）" value={deletePassword} onChange={setDeletePassword} type="password" autoComplete="current-password" /><Field label="输入“删除账号”确认" value={deleteConfirm} onChange={setDeleteConfirm} /><button type="button" disabled={busy === "delete" || deleteConfirm !== "删除账号"} onClick={() => void deleteAccount()}><Trash2 size={16} /> 永久删除账号</button></div></section>
          </div>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}

function AccountState({ loading = false }: { loading?: boolean }) { return <main className={styles.page}><SiteHeader /><section className={styles.state}>{loading ? <><LoaderCircle className={styles.spin} size={28} /><h1>正在读取账号</h1></> : <><ShieldCheck size={32} /><h1>请先登录</h1><p>登录后即可管理账号与安全设置。</p><Link className="button button-primary" href="/auth/login?returnTo=%2Faccount">登录账号</Link></>}</section></main>; }
function PanelTitle({ icon: Icon, title, text }: { icon: typeof UserRound; title: string; text: string }) { return <header className={styles.panelTitle}><span><Icon size={19} /></span><div><h2>{title}</h2><p>{text}</p></div></header>; }
function Field({ label, hint, value, onChange, ...props }: { label: string; hint?: string; value: string; onChange: (value: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) { return <label className={styles.field}><span>{label}</span><input {...props} value={value} onChange={(event) => onChange(event.target.value)} />{hint && <small>{hint}</small>}</label>; }
function providerLabel(provider: string) { return provider === "google" ? "Google" : provider === "github" ? "GitHub" : provider === "wechat" ? "微信扫码" : provider === "credential" ? "邮箱密码" : provider; }
function displayEmail(email: string) { return email.endsWith(".invalid") ? "尚未绑定公开邮箱" : email; }
function maskPhone(value: string) { return `${value.slice(0, 5)}****${value.slice(-4)}`; }
function deviceName(agent?: string | null) { if (!agent) return "未知设备"; const browser = /Chrome/i.test(agent) ? "Chrome" : /Safari/i.test(agent) ? "Safari" : /Firefox/i.test(agent) ? "Firefox" : "浏览器"; const os = /iPhone|iPad/i.test(agent) ? "iOS" : /Mac/i.test(agent) ? "macOS" : /Windows/i.test(agent) ? "Windows" : /Android/i.test(agent) ? "Android" : "设备"; return `${browser} · ${os}`; }
