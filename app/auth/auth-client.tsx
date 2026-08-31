"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Github,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Mail,
  Phone,
  QrCode,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { authClient } from "@/lib/auth-client";
import type { AuthCapabilities } from "@/lib/auth-notifications";
import {
  authErrorMessage,
  normalizeMainlandPhone,
  passwordIssue,
  safeReturnTo,
} from "@/lib/auth-utils";
import styles from "./auth.module.css";

type AuthMode = "login" | "register" | "forgot" | "reset" | "check-email" | "verified";
type Notice = { tone: "error" | "success" | "info"; text: string } | null;

const emptyCapabilities: AuthCapabilities = {
  email: false,
  google: false,
  github: false,
  wechat: false,
  phone: false,
  developmentCapture: false,
};

export function AuthClient({
  mode,
  returnTo,
  token,
  initialError,
}: {
  mode: AuthMode;
  returnTo?: string;
  token?: string;
  initialError?: string;
}) {
  const router = useRouter();
  const destination = useMemo(() => safeReturnTo(returnTo), [returnTo]);
  const [capabilities, setCapabilities] = useState<AuthCapabilities>(emptyCapabilities);
  const [capabilitiesReady, setCapabilitiesReady] = useState(false);
  const [method, setMethod] = useState<"email" | "phone">("email");
  const [stage, setStage] = useState<"details" | "otp" | "done">("details");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [normalizedPhone, setNormalizedPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<Notice>(
    initialError ? { tone: "error", text: authErrorMessage(initialError) } : null,
  );

  useEffect(() => {
    let active = true;
    void fetch("/api/auth/providers")
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return await response.json() as AuthCapabilities;
      })
      .then((value) => { if (active) setCapabilities(value); })
      .catch(() => undefined)
      .finally(() => { if (active) setCapabilitiesReady(true); });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    if (mode === "login") return method === "email" ? signInEmail() : phoneLogin();
    if (mode === "register") return signUpEmail();
    if (mode === "forgot") return method === "email" ? requestEmailReset() : phoneReset();
    if (mode === "reset") return resetEmailPassword();
  }

  async function signInEmail() {
    setBusy("email");
    const result = await authClient.signIn.email({
      email: email.trim(),
      password,
      rememberMe: remember,
      callbackURL: destination,
    });
    setBusy("");
    if (result.error) return showError(result.error);
    router.push(destination);
    router.refresh();
  }

  async function signUpEmail() {
    if (!capabilities.email) return setNotice({ tone: "error", text: "邮件发送服务尚未配置" });
    const issue = passwordIssue(password);
    if (issue) return setNotice({ tone: "error", text: issue });
    if (password !== confirmPassword) return setNotice({ tone: "error", text: "两次输入的密码不一致" });
    if (!accepted) return setNotice({ tone: "error", text: "请先阅读并同意用户协议与隐私说明" });
    setBusy("email");
    const result = await authClient.signUp.email({
      name: name.trim(),
      email: email.trim(),
      password,
      callbackURL: destination,
    });
    setBusy("");
    if (result.error) return showError(result.error);
    router.push("/auth/check-email");
  }

  async function requestEmailReset() {
    if (!capabilities.email) return setNotice({ tone: "error", text: "邮件发送服务尚未配置" });
    setBusy("email-reset");
    const result = await authClient.requestPasswordReset({
      email: email.trim(),
      redirectTo: "/auth/reset-password",
    });
    setBusy("");
    if (result.error) return showError(result.error);
    setStage("done");
  }

  async function resetEmailPassword() {
    if (!token) return setNotice({ tone: "error", text: "重置链接无效或已过期，请重新申请" });
    const issue = passwordIssue(password);
    if (issue) return setNotice({ tone: "error", text: issue });
    if (password !== confirmPassword) return setNotice({ tone: "error", text: "两次输入的密码不一致" });
    setBusy("password-reset");
    const result = await authClient.resetPassword({ newPassword: password, token });
    setBusy("");
    if (result.error) return showError(result.error);
    setStage("done");
  }

  async function phoneLogin() {
    if (stage === "details") return sendPhoneCode("login");
    setBusy("phone-verify");
    const result = await authClient.phoneNumber.verify({ phoneNumber: normalizedPhone, code: otp });
    setBusy("");
    if (result.error) return showError(result.error);
    router.push(destination);
    router.refresh();
  }

  async function phoneReset() {
    if (stage === "details") return sendPhoneCode("reset");
    const issue = passwordIssue(password);
    if (issue) return setNotice({ tone: "error", text: issue });
    if (password !== confirmPassword) return setNotice({ tone: "error", text: "两次输入的密码不一致" });
    setBusy("phone-reset");
    const result = await authClient.phoneNumber.resetPassword({
      phoneNumber: normalizedPhone,
      otp,
      newPassword: password,
    });
    setBusy("");
    if (result.error) return showError(result.error);
    setStage("done");
  }

  async function sendPhoneCode(purpose: "login" | "reset") {
    if (!capabilities.phone) return setNotice({ tone: "error", text: "短信服务尚未配置" });
    const normalized = normalizeMainlandPhone(phone);
    if (!normalized) return setNotice({ tone: "error", text: "请输入有效的中国大陆手机号" });
    setBusy("phone-code");
    const result = purpose === "login"
      ? await authClient.phoneNumber.sendOtp({ phoneNumber: normalized })
      : await authClient.phoneNumber.requestPasswordReset({ phoneNumber: normalized });
    setBusy("");
    if (result.error) return showError(result.error);
    setNormalizedPhone(normalized);
    setStage("otp");
    setNotice({ tone: "success", text: `验证码已发送至 ${maskPhone(normalized)}` });
  }

  async function social(provider: "google" | "github" | "wechat") {
    setNotice(null);
    setBusy(provider);
    const result = await authClient.signIn.social({
      provider,
      callbackURL: destination,
      errorCallbackURL: "/auth/login?error=PROVIDER_NOT_FOUND",
    });
    if (result?.error) {
      setBusy("");
      showError(result.error);
    }
  }

  function showError(error: { code?: string; message?: string }) {
    setNotice({ tone: "error", text: authErrorMessage(error.code, error.message) });
  }

  if (mode === "check-email") {
    return <StatusPage icon={Mail} title="检查你的邮箱" text="如果账号信息有效，我们已经发送了确认邮件。请在 1 小时内完成确认，也可以检查垃圾邮件目录。" action="返回登录" href="/auth/login" />;
  }
  if (mode === "verified") {
    return <StatusPage icon={CheckCircle2} title="邮箱已确认" text="账号已经可以使用。登录后，当前浏览器里的访客简历会自动并入你的账号。" action="立即登录" href="/auth/login" success />;
  }
  if (stage === "done" && mode === "forgot") {
    return method === "email"
      ? <StatusPage icon={Mail} title="检查你的邮箱" text="如果该邮箱已注册，我们已经发送了密码重置链接。为保护账号，不会在这里显示邮箱是否存在。" action="返回登录" href="/auth/login" />
      : <StatusPage icon={CheckCircle2} title="密码已更新" text="手机号对应账号的密码已重置，现在可以使用新密码或短信验证码登录。" action="返回登录" href="/auth/login" success />;
  }
  if (stage === "done" && mode === "reset") {
    return <StatusPage icon={CheckCircle2} title="密码已更新" text="所有其他登录会话已撤销。请使用新密码重新登录。" action="返回登录" href="/auth/login" success />;
  }

  const title = mode === "login" ? "欢迎回来" : mode === "register" ? "创建你的账号" : mode === "forgot" ? "找回账号访问" : "设置新密码";
  const subtitle = mode === "login"
    ? "登录后跨设备保存简历，访客草稿会自动迁移。"
    : mode === "register"
      ? "一个账号，安全管理你的简历与登录方式。"
      : mode === "forgot"
        ? "选择邮箱或中国大陆手机号验证身份。"
        : "请输入一组新的安全密码。";

  return (
    <AuthShell>
      <section className={styles.card} aria-labelledby="auth-title">
        <div className={styles.cardHeader}>
          <p>{mode === "login" ? "账号登录" : mode === "register" ? "注册" : "账号安全"}</p>
          <h1 id="auth-title">{title}</h1>
          <span>{subtitle}</span>
        </div>

        {(mode === "login" || mode === "register") && (
          <div className={styles.methods}>
            <ProviderButton label="Google" symbol="G" enabled={capabilities.google} ready={capabilitiesReady} busy={busy === "google"} onClick={() => void social("google")} />
            <ProviderButton label="GitHub" icon={Github} enabled={capabilities.github} ready={capabilitiesReady} busy={busy === "github"} onClick={() => void social("github")} />
            <ProviderButton label="微信扫码" icon={QrCode} enabled={capabilities.wechat} ready={capabilitiesReady} busy={busy === "wechat"} onClick={() => void social("wechat")} />
          </div>
        )}

        {(mode === "login" || mode === "register") && <div className={styles.divider}><span>或使用账号</span></div>}

        {(mode === "login" || mode === "forgot") && (
          <div className={styles.tabs} role="tablist" aria-label="登录方式">
            <button type="button" role="tab" aria-selected={method === "email"} onClick={() => { setMethod("email"); setStage("details"); setNotice(null); }}><Mail size={16} /> 邮箱</button>
            <button type="button" role="tab" aria-selected={method === "phone"} onClick={() => { setMethod("phone"); setStage("details"); setNotice(null); }}><Phone size={16} /> 手机号</button>
          </div>
        )}

        {notice && <div className={styles.formAlert} data-tone={notice.tone} role={notice.tone === "error" ? "alert" : "status"}>{notice.text}</div>}

        <form className={styles.form} onSubmit={(event) => void submit(event)}>
          {mode === "register" && <TextField label="姓名或称呼" value={name} onChange={setName} name="name" autoComplete="name" icon={Sparkles} required />}

          {method === "email" && mode !== "reset" && <TextField label="邮箱" value={email} onChange={setEmail} name="email" type="email" autoComplete="email" icon={Mail} placeholder="name@example.com" required />}

          {method === "phone" && mode !== "reset" && (
            <>
              <TextField label="中国大陆手机号" value={phone} onChange={setPhone} name="tel" type="tel" autoComplete="tel-national" icon={Phone} placeholder="138 0000 0000" required disabled={stage === "otp"} />
              {stage === "otp" && <TextField label="6 位验证码" value={otp} onChange={(value) => setOtp(value.replace(/\D/g, "").slice(0, 6))} name="one-time-code" inputMode="numeric" autoComplete="one-time-code" icon={KeyRound} placeholder="000000" required />}
            </>
          )}

          {((mode === "login" && method === "email") || mode === "register") && <TextField label="密码" value={password} onChange={setPassword} name="password" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} icon={LockKeyhole} required />}

          {(mode === "reset" || (mode === "forgot" && method === "phone" && stage === "otp")) && (
            <>
              <TextField label="新密码" hint="至少 12 位，并同时包含字母和数字" value={password} onChange={setPassword} name="new-password" type="password" autoComplete="new-password" icon={LockKeyhole} required />
              <TextField label="确认新密码" value={confirmPassword} onChange={setConfirmPassword} name="confirm-password" type="password" autoComplete="new-password" icon={ShieldCheck} required />
            </>
          )}

          {mode === "register" && <TextField label="确认密码" value={confirmPassword} onChange={setConfirmPassword} name="confirm-password" type="password" autoComplete="new-password" icon={ShieldCheck} required />}

          {mode === "login" && method === "email" && <div className={styles.formOptions}><label><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /> 保持登录</label><Link href="/auth/forgot-password">忘记密码？</Link></div>}

          {mode === "register" && <label className={styles.agreement}><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /><span>我已阅读并同意 <Link href="/terms">用户协议</Link> 和 <Link href="/privacy">隐私与 AI 说明</Link></span></label>}

          {mode === "register" && capabilitiesReady && !capabilities.email && <p className={styles.providerHint}>邮箱注册将在配置邮件服务后开放；Google、GitHub 或微信可独立启用。</p>}
          {method === "phone" && capabilitiesReady && !capabilities.phone && <p className={styles.providerHint}>手机号登录将在腾讯云短信签名与模板审核完成后开放。</p>}

          <button className="button button-primary" type="submit" disabled={Boolean(busy) || (method === "phone" && !capabilities.phone) || (mode === "register" && !capabilities.email)}>
            {busy ? <LoaderCircle className={styles.spin} size={17} /> : <ArrowRight size={17} />}
            {submitLabel(mode, method, stage)}
          </button>

          {method === "phone" && stage === "otp" && <button className={styles.inlineButton} type="button" disabled={Boolean(busy)} onClick={() => { setStage("details"); setOtp(""); setNotice(null); }}>修改手机号或重新获取</button>}
        </form>

        <div className={styles.authFooter}>
          {mode === "login" && <>还没有账号？ <Link href={`/auth/register?returnTo=${encodeURIComponent(destination)}`}>免费注册</Link></>}
          {mode === "register" && <>已有账号？ <Link href={`/auth/login?returnTo=${encodeURIComponent(destination)}`}>直接登录</Link></>}
          {(mode === "forgot" || mode === "reset") && <Link href="/auth/login"><ArrowLeft size={14} /> 返回登录</Link>}
        </div>
      </section>
    </AuthShell>
  );
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return <main className={styles.page}><div className={styles.layout}><aside className={styles.intro}><Brand /><div><p className="eyebrow">简历属于你</p><h2>从访客草稿，到长期可管理的个人作品。</h2><p>安全登录、跨设备保存，并由你决定绑定哪些登录方式。</p></div><ul><li><ShieldCheck size={18} /> 登录后自动迁移当前草稿</li><li><LockKeyhole size={18} /> 密码加密、会话可撤销</li><li><QrCode size={18} /> 中国地区支持微信与手机号</li></ul></aside><div className={styles.cardColumn}><Link className={styles.backHome} href="/"><ArrowLeft size={15} /> 返回首页</Link>{children}<p className={styles.securityNote}><ShieldCheck size={14} /> 认证信息只用于账号安全与数据归属</p></div></div></main>;
}

function StatusPage({ icon: Icon, title, text, action, href, success = false }: { icon: typeof Mail; title: string; text: string; action: string; href: string; success?: boolean }) {
  return <AuthShell><section className={`${styles.card} ${styles.statusCard}`}><span data-success={success}><Icon size={30} /></span><p className="eyebrow">账号安全</p><h1>{title}</h1><p>{text}</p><Link className="button button-primary" href={href}>{action}<ArrowRight size={16} /></Link></section></AuthShell>;
}

function ProviderButton({ label, icon: Icon, symbol, enabled, ready, busy, onClick }: { label: string; icon?: typeof Github; symbol?: string; enabled: boolean; ready: boolean; busy: boolean; onClick: () => void }) {
  return <button type="button" disabled={!enabled || busy} title={ready && !enabled ? `${label} 待配置` : undefined} onClick={onClick}><span>{busy ? <LoaderCircle className={styles.spin} size={18} /> : Icon ? <Icon size={18} /> : symbol}</span><strong>{label}</strong>{ready && !enabled && <small>待配置</small>}</button>;
}

function TextField({ label, hint, value, onChange, icon: Icon, ...input }: { label: string; hint?: string; value: string; onChange: (value: string) => void; icon: typeof Mail } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return <label className={styles.field}><span>{label}</span><div className={styles.inputShell}><Icon size={17} /><input {...input} value={value} onChange={(event) => onChange(event.target.value)} /></div>{hint && <small>{hint}</small>}</label>;
}

function submitLabel(mode: AuthMode, method: "email" | "phone", stage: "details" | "otp" | "done") {
  if (mode === "login") return method === "email" ? "登录" : stage === "details" ? "获取验证码" : "验证并登录";
  if (mode === "register") return "创建账号";
  if (mode === "forgot") return method === "email" ? "发送重置邮件" : stage === "details" ? "发送重置验证码" : "设置新密码";
  return "更新密码";
}

function maskPhone(value: string) {
  return `${value.slice(0, 5)}****${value.slice(-4)}`;
}
