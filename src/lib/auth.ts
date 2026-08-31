import { env, waitUntil } from "cloudflare:workers";
import { betterAuth } from "better-auth";
import { admin, phoneNumber } from "better-auth/plugins";
import { authRoles } from "@/lib/auth-access";
import { getAuthCapabilities, sendAuthEmail, sendPhoneOtp } from "@/lib/auth-notifications";
import { normalizeMainlandPhone } from "@/lib/auth-utils";

const baseURL = env.BETTER_AUTH_URL ?? env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
const localAuth = ["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname);
const secret = env.BETTER_AUTH_SECRET
  ?? (localAuth ? "jianji-local-development-secret-change-before-production" : undefined);
const capabilities = getAuthCapabilities();
const adminEmails = new Set(
  (env.AUTH_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

if (!secret) throw new Error("BETTER_AUTH_SECRET is required outside local development");

const socialProviders = {
  ...(capabilities.google ? {
    google: { clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET! },
  } : {}),
  ...(capabilities.github ? {
    github: { clientId: env.GITHUB_CLIENT_ID!, clientSecret: env.GITHUB_CLIENT_SECRET! },
  } : {}),
  ...(capabilities.wechat ? {
    wechat: {
      clientId: env.WECHAT_CLIENT_ID!,
      clientSecret: env.WECHAT_CLIENT_SECRET!,
      lang: "cn" as const,
    },
  } : {}),
};

export const auth = betterAuth({
  appName: "简迹 CV",
  baseURL,
  basePath: "/api/auth",
  secret,
  database: env.DB,
  trustedOrigins: [baseURL, "http://localhost:3000", "http://127.0.0.1:3000"],
  advanced: {
    ipAddress: {
      ipAddressHeaders: ["cf-connecting-ip"],
      ipv6Subnet: 64,
    },
    backgroundTasks: { handler: waitUntil },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    async sendResetPassword({ user, url }) {
      await sendAuthEmail({
        to: user.email,
        subject: "重置你的简迹 CV 密码",
        heading: "重置密码",
        message: "我们收到了重置密码的请求。点击下方按钮设置新密码。",
        actionLabel: "设置新密码",
        actionUrl: url,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60,
    async sendVerificationEmail({ user, url }) {
      await sendAuthEmail({
        to: user.email,
        subject: "确认你的简迹 CV 邮箱",
        heading: "确认邮箱",
        message: "完成邮箱确认后，你的简历就能安全地跟随账号保存。",
        actionLabel: "确认邮箱",
        actionUrl: url,
      });
    },
  },
  socialProviders,
  user: {
    modelName: "users",
    fields: {
      emailVerified: "email_verified",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
    validateUserInfo({ source }) {
      if (source.action === "create-user" && source.method === "email-password" && !capabilities.email) {
        return { error: "EMAIL_DELIVERY_UNAVAILABLE", errorDescription: "邮件服务尚未配置" };
      }
      if (source.action === "create-user" && source.method === "phone-number" && !capabilities.phone) {
        return { error: "SMS_DELIVERY_UNAVAILABLE", errorDescription: "短信服务尚未配置" };
      }
    },
    changeEmail: {
      enabled: true,
      updateEmailWithoutVerification: false,
      async sendChangeEmailConfirmation({ user, newEmail, url }) {
        await sendAuthEmail({
          to: user.email.endsWith(".invalid") ? newEmail : user.email,
          subject: "确认修改简迹 CV 登录邮箱",
          heading: "确认修改邮箱",
          message: `你的登录邮箱将修改为 ${newEmail}。如果这是你的操作，请继续确认。`,
          actionLabel: "确认修改",
          actionUrl: url,
        });
      },
    },
    deleteUser: {
      enabled: true,
      async beforeDelete(user) {
        await deleteApplicationData(user.id);
      },
    },
  },
  session: {
    modelName: "auth_sessions",
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    freshAge: 60 * 60,
    fields: {
      expiresAt: "expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
      ipAddress: "ip_address",
      userAgent: "user_agent",
      userId: "user_id",
    },
    cookieCache: { enabled: true, maxAge: 60 * 5, strategy: "jwe" },
  },
  account: {
    modelName: "auth_accounts",
    fields: {
      accountId: "account_id",
      providerId: "provider_id",
      userId: "user_id",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      idToken: "id_token",
      accessTokenExpiresAt: "access_token_expires_at",
      refreshTokenExpiresAt: "refresh_token_expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
    accountLinking: {
      enabled: true,
      disableImplicitLinking: true,
      allowDifferentEmails: false,
      allowUnlinkingAll: false,
    },
    encryptOAuthTokens: true,
    storeAccountCookie: false,
  },
  verification: {
    modelName: "auth_verifications",
    fields: {
      expiresAt: "expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
    storeIdentifier: "hashed",
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    modelName: "auth_rate_limits",
    fields: { lastRequest: "last_request" },
    window: 60,
    max: 60,
    customRules: {
      "/sign-in/email": { window: 60, max: 8 },
      "/sign-up/email": { window: 300, max: 5 },
      "/request-password-reset": { window: 300, max: 5 },
      "/phone-number/send-otp": { window: 300, max: 3 },
      "/phone-number/request-password-reset": { window: 300, max: 3 },
    },
  },
  databaseHooks: {
    user: {
      create: {
        async before(user) {
          if (!adminEmails.has(user.email.toLowerCase())) return;
          return { data: { ...user, role: "admin" } };
        },
      },
    },
  },
  plugins: [
    phoneNumber({
      otpLength: 6,
      expiresIn: 5 * 60,
      allowedAttempts: 3,
      requireVerification: true,
      phoneNumberValidator: (value) => Boolean(normalizeMainlandPhone(value)),
      sendOTP: ({ phoneNumber: value, code }) => sendPhoneOtp(value, code),
      sendPasswordResetOTP: ({ phoneNumber: value, code }) => sendPhoneOtp(value, code),
      signUpOnVerification: {
        getTempEmail: () => `phone-${crypto.randomUUID()}@phone.jianji.invalid`,
        getTempName: (value) => `用户 ${value.slice(-4)}`,
      },
      schema: {
        user: {
          fields: {
            phoneNumber: "phone_number",
            phoneNumberVerified: "phone_number_verified",
          },
        },
      },
    }),
    admin({
      defaultRole: "user",
      adminRoles: ["admin"],
      roles: authRoles,
      bannedUserMessage: "账号已被停用，如有疑问请联系管理员",
      schema: {
        user: {
          fields: {
            role: "role",
            banned: "banned",
            banReason: "ban_reason",
            banExpires: "ban_expires",
          },
        },
        session: { fields: { impersonatedBy: "impersonated_by" } },
      },
    }),
  ],
});

async function deleteApplicationData(userId: string) {
  const db = env.DB;
  await db.batch([
    db.prepare("DELETE FROM model_request_leases WHERE request_id IN (SELECT request_id FROM model_session_leases WHERE owner_key = ?)").bind(userId),
    db.prepare("DELETE FROM model_session_leases WHERE owner_key = ?").bind(userId),
    db.prepare("DELETE FROM suggestion_events WHERE resume_id IN (SELECT id FROM resumes WHERE user_id = ?)").bind(userId),
    db.prepare("DELETE FROM resume_versions WHERE resume_id IN (SELECT id FROM resumes WHERE user_id = ?)").bind(userId),
    db.prepare("DELETE FROM resume_target_briefs WHERE user_id = ? OR resume_id IN (SELECT id FROM resumes WHERE user_id = ?)").bind(userId, userId),
    db.prepare("DELETE FROM model_consent_events WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM advice_usage_events WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM model_usage_events WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM audit_events WHERE actor_id = ?").bind(userId),
    db.prepare("DELETE FROM resumes WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM guest_sessions WHERE user_id = ?").bind(userId),
  ]);
}
