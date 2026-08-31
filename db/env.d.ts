declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    APP_ENV?: string;
    AUTH_DEV_CAPTURE?: string;
    DEEPSEEK_API_KEY?: string;
    DEEPSEEK_BASE_URL?: string;
    DEEPSEEK_MODEL?: string;
    NEXT_PUBLIC_SITE_URL?: string;
    BETTER_AUTH_URL?: string;
    BETTER_AUTH_SECRET?: string;
    BETTER_AUTH_SECRETS?: string;
    BETTER_AUTH_TRUSTED_ORIGINS?: string;
    DEEPSEEK_ENABLED?: string;
    DEEPSEEK_DAILY_BUDGET_CNY?: string;
    PROMO_REDEMPTION_PEPPER?: string;
    MAINTENANCE_SECRET?: string;
    AUTH_ADMIN_EMAILS?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    GITHUB_CLIENT_ID?: string;
    GITHUB_CLIENT_SECRET?: string;
    WECHAT_CLIENT_ID?: string;
    WECHAT_CLIENT_SECRET?: string;
    RESEND_API_KEY?: string;
    AUTH_EMAIL_FROM?: string;
    TENCENTCLOUD_SECRET_ID?: string;
    TENCENTCLOUD_SECRET_KEY?: string;
    TENCENT_SMS_SDK_APP_ID?: string;
    TENCENT_SMS_SIGN_NAME?: string;
    TENCENT_SMS_TEMPLATE_ID?: string;
    TENCENT_SMS_REGION?: string;
  }
}
