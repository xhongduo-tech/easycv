import { env } from "cloudflare:workers";
import { resolveAuthRuntime } from "@/lib/auth-runtime";

const encoder = new TextEncoder();

export interface AuthCapabilities {
  email: boolean;
  google: boolean;
  github: boolean;
  wechat: boolean;
  phone: boolean;
  developmentCapture: boolean;
}

export function getAuthCapabilities(): AuthCapabilities {
  const runtime = resolveAuthRuntime(env);
  const capture = runtime.developmentCapture;
  return {
    email: capture || Boolean(env.RESEND_API_KEY && env.AUTH_EMAIL_FROM),
    google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    github: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
    wechat: Boolean(env.WECHAT_CLIENT_ID && env.WECHAT_CLIENT_SECRET),
    phone: capture || Boolean(
      env.TENCENTCLOUD_SECRET_ID
      && env.TENCENTCLOUD_SECRET_KEY
      && env.TENCENT_SMS_SDK_APP_ID
      && env.TENCENT_SMS_SIGN_NAME
      && env.TENCENT_SMS_TEMPLATE_ID,
    ),
    developmentCapture: capture,
  };
}

export async function sendAuthEmail(input: {
  to: string;
  subject: string;
  heading: string;
  message: string;
  actionLabel: string;
  actionUrl: string;
}) {
  if (resolveAuthRuntime(env).developmentCapture && !env.RESEND_API_KEY) {
    console.info(`[简迹本地邮件] ${input.subject}: ${input.actionUrl}`);
    return;
  }
  if (!env.RESEND_API_KEY || !env.AUTH_EMAIL_FROM) throw new Error("EMAIL_DELIVERY_UNAVAILABLE");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: env.AUTH_EMAIL_FROM,
      to: [input.to],
      subject: input.subject,
      text: `${input.heading}\n\n${input.message}\n\n${input.actionLabel}: ${input.actionUrl}\n\n如果不是你发起的操作，请忽略本邮件。`,
      html: authEmailHtml(input),
    }),
  });
  if (!response.ok) throw new Error("EMAIL_DELIVERY_UNAVAILABLE");
}

export async function sendPhoneOtp(phoneNumber: string, code: string) {
  if (resolveAuthRuntime(env).developmentCapture && !env.TENCENTCLOUD_SECRET_ID) {
    console.info(`[简迹本地短信] ${phoneNumber.slice(-4)}: ${code}`);
    return;
  }
  const secretId = env.TENCENTCLOUD_SECRET_ID;
  const secretKey = env.TENCENTCLOUD_SECRET_KEY;
  const appId = env.TENCENT_SMS_SDK_APP_ID;
  const signName = env.TENCENT_SMS_SIGN_NAME;
  const templateId = env.TENCENT_SMS_TEMPLATE_ID;
  if (!secretId || !secretKey || !appId || !signName || !templateId) {
    throw new Error("SMS_DELIVERY_UNAVAILABLE");
  }

  const host = "sms.tencentcloudapi.com";
  const service = "sms";
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const payload = JSON.stringify({
    PhoneNumberSet: [phoneNumber],
    SmsSdkAppId: appId,
    SignName: signName,
    TemplateId: templateId,
    TemplateParamSet: [code, "5"],
  });
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\n`;
  const signedHeaders = "content-type;host";
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    await sha256Hex(payload),
  ].join("\n");
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = [
    "TC3-HMAC-SHA256",
    String(timestamp),
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");
  const secretDate = await hmac(`TC3${secretKey}`, date);
  const secretService = await hmac(secretDate, service);
  const secretSigning = await hmac(secretService, "tc3_request");
  const signature = bytesToHex(await hmac(secretSigning, stringToSign));
  const authorization = `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(`https://${host}`, {
    method: "POST",
    headers: {
      authorization,
      "content-type": "application/json; charset=utf-8",
      host,
      "x-tc-action": "SendSms",
      "x-tc-region": env.TENCENT_SMS_REGION ?? "ap-guangzhou",
      "x-tc-timestamp": String(timestamp),
      "x-tc-version": "2021-01-11",
    },
    body: payload,
  });
  const result = await response.json().catch(() => null) as {
    Response?: { Error?: { Code?: string }; SendStatusSet?: Array<{ Code?: string }> };
  } | null;
  const status = result?.Response?.SendStatusSet?.[0]?.Code;
  if (!response.ok || result?.Response?.Error || (status && status !== "Ok")) {
    throw new Error("SMS_DELIVERY_UNAVAILABLE");
  }
}

function authEmailHtml(input: {
  heading: string;
  message: string;
  actionLabel: string;
  actionUrl: string;
}) {
  const heading = escapeHtml(input.heading);
  const message = escapeHtml(input.message);
  const label = escapeHtml(input.actionLabel);
  const url = escapeHtml(input.actionUrl);
  return `<div style="background:#f4f2ed;padding:32px 16px;font-family:Inter,-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;color:#171822"><div style="max-width:560px;margin:auto;background:#fff;border:1px solid #dedbd3;border-radius:18px;padding:32px"><div style="font-weight:800;font-size:20px;margin-bottom:28px">简迹 <span style="color:#5c3ee8">CV</span></div><h1 style="font-size:24px;margin:0 0 12px">${heading}</h1><p style="color:#6d7080;line-height:1.7;margin:0 0 24px">${message}</p><a href="${url}" style="display:inline-block;background:#5c3ee8;color:#fff;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:700">${label}</a><p style="font-size:12px;color:#9295a4;line-height:1.6;margin:28px 0 0">链接将在 1 小时后失效。如果不是你发起的操作，请忽略本邮件。</p></div></div>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] ?? character);
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToHex(new Uint8Array(digest));
}

async function hmac(key: string | Uint8Array, value: string) {
  const rawKey = Uint8Array.from(typeof key === "string" ? encoder.encode(key) : key);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    rawKey.buffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(value)));
}

function bytesToHex(value: Uint8Array) {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
