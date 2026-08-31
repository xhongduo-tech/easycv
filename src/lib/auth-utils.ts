export function safeReturnTo(value: string | null | undefined, fallback = "/dashboard") {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return fallback;
  try {
    const url = new URL(value, "https://jianji.local");
    return url.origin === "https://jianji.local" ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch {
    return fallback;
  }
}

export function normalizeMainlandPhone(value: string) {
  const compact = value.replace(/[\s()-]/g, "");
  const normalized = compact.startsWith("+86")
    ? compact
    : compact.startsWith("86") && compact.length === 13
      ? `+${compact}`
      : compact.length === 11
        ? `+86${compact}`
        : compact;
  return /^\+861[3-9]\d{9}$/.test(normalized) ? normalized : null;
}

export function passwordIssue(password: string) {
  if (password.length < 12) return "密码至少需要 12 位";
  if (password.length > 128) return "密码不能超过 128 位";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "密码需同时包含字母和数字";
  return "";
}

export function authErrorMessage(code?: string, fallback = "操作失败，请稍后重试") {
  const messages: Record<string, string> = {
    INVALID_EMAIL_OR_PASSWORD: "邮箱或密码不正确",
    EMAIL_NOT_VERIFIED: "请先完成邮箱验证",
    USER_ALREADY_EXISTS: "该邮箱已注册，请直接登录",
    USER_NOT_FOUND: "账号不存在或验证码已失效",
    INVALID_PHONE_NUMBER: "请输入有效的中国大陆手机号",
    INVALID_OTP: "验证码不正确或已失效",
    TOO_MANY_ATTEMPTS: "尝试次数过多，请重新获取验证码",
    PASSWORD_TOO_SHORT: "密码至少需要 12 位",
    PASSWORD_TOO_LONG: "密码不能超过 128 位",
    SESSION_EXPIRED: "登录已失效，请重新登录",
    PROVIDER_NOT_FOUND: "该登录方式尚未配置",
    EMAIL_DELIVERY_UNAVAILABLE: "邮件服务尚未配置，请选择其他登录方式",
    SMS_DELIVERY_UNAVAILABLE: "短信服务尚未配置，请选择其他登录方式",
  };
  return code ? messages[code] ?? fallback : fallback;
}
