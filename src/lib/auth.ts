import { env, waitUntil } from "cloudflare:workers";
import { betterAuth } from "better-auth";
import { admin, phoneNumber, twoFactor } from "better-auth/plugins";
import { authRoles } from "@/lib/auth-access";
import { deleteApplicationData } from "@/lib/account-deletion";
import { getAuthCapabilities, sendAuthEmail, sendPhoneOtp } from "@/lib/auth-notifications";
import { normalizeMainlandPhone } from "@/lib/auth-utils";
import { resolveAuthRuntime } from "@/lib/auth-runtime";
import { syncSignupPromoIdentities } from "@/lib/credits";

const runtime = resolveAuthRuntime(env);
const { baseURL, secret } = runtime;
const capabilities = getAuthCapabilities();
const adminEmails = new Set(
  (env.AUTH_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);

const PROMO_IDENTITY_FIELDS = new Set([
  "email",
  "emailVerified",
  "phoneNumber",
  "phoneNumberVerified",
]);

async function syncCurrentSignupPromoIdentities(userId: string | undefined) {
  if (!userId) return;
  await syncSignupPromoIdentities(env.DB, userId, env.PROMO_REDEMPTION_PEPPER);
}

export function isConfiguredAdminEmail(email: string | null | undefined) {
  return Boolean(email && adminEmails.has(email.trim().toLowerCase()));
}

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
  ...(runtime.secrets ? { secrets: runtime.secrets } : {}),
  database: env.DB,
  trustedOrigins: runtime.trustedOrigins,
  advanced: {
    useSecureCookies: runtime.appEnvironment === "production",
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
        await deleteApplicationData(env.DB, user.id, env.PROMO_REDEMPTION_PEPPER);
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
    additionalFields: {
      adminMfaVerifiedAt: {
        type: "date",
        required: false,
        input: false,
        returned: false,
        fieldName: "admin_mfa_verified_at",
      },
    },
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
        async after(user) {
          await syncCurrentSignupPromoIdentities(user.id);
        },
      },
      update: {
        async before(update, context) {
          if (!Object.keys(update).some((key) => PROMO_IDENTITY_FIELDS.has(key))) return;
          const currentUserId = context?.context.session?.user.id
            ?? context?.context.newSession?.user.id;
          await syncCurrentSignupPromoIdentities(currentUserId);
        },
        async after(user) {
          await syncCurrentSignupPromoIdentities(user.id);
        },
      },
    },
    account: {
      create: {
        async after(account) {
          await syncCurrentSignupPromoIdentities(account.userId);
        },
      },
      delete: {
        async before(account) {
          await syncCurrentSignupPromoIdentities(account.userId);
        },
      },
    },
    session: {
      create: {
        async before(session, context) {
          if (!new Set([
            "/two-factor/verify-totp",
            "/two-factor/verify-backup-code",
          ]).has(context?.path ?? "")) return;
          return { data: { ...session, adminMfaVerifiedAt: new Date() } };
        },
      },
    },
  },
  plugins: [
    twoFactor({
      issuer: "简迹 CV",
      twoFactorTable: "auth_two_factors",
      allowPasswordless: true,
      trustDeviceMaxAge: 60 * 60 * 24 * 14,
      accountLockout: { enabled: true, maxFailedAttempts: 8, durationSeconds: 15 * 60 },
      schema: {
        user: { fields: { twoFactorEnabled: "two_factor_enabled" } },
        twoFactor: {
          modelName: "auth_two_factors",
          fields: {
            userId: "user_id",
            backupCodes: "backup_codes",
            failedVerificationCount: "failed_verification_count",
            lockedUntil: "locked_until",
          },
        },
      },
    }),
    phoneNumber({
      otpLength: 6,
      expiresIn: 5 * 60,
      allowedAttempts: 3,
      requireVerification: true,
      phoneNumberValidator: (value) => Boolean(normalizeMainlandPhone(value)),
      sendOTP: ({ phoneNumber: value, code }) => sendPhoneOtp(value, code),
      sendPasswordResetOTP: ({ phoneNumber: value, code }) => sendPhoneOtp(value, code),
      callbackOnVerification: ({ user }) => syncCurrentSignupPromoIdentities(user.id),
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
