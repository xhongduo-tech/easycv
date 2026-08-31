const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const DEVELOPMENT_SECRET = "jianji-local-development-secret-change-before-production";

export type ApplicationEnvironment = "development" | "test" | "production";

export interface AuthRuntimeEnvironment {
  APP_ENV?: string;
  AUTH_DEV_CAPTURE?: string;
  BETTER_AUTH_URL?: string;
  NEXT_PUBLIC_SITE_URL?: string;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_SECRETS?: string;
  BETTER_AUTH_TRUSTED_ORIGINS?: string;
  PROMO_REDEMPTION_PEPPER?: string;
  MAINTENANCE_SECRET?: string;
}

export interface AuthRuntimeConfig {
  appEnvironment: ApplicationEnvironment;
  baseURL: string;
  local: boolean;
  developmentCapture: boolean;
  secret: string;
  secrets?: Array<{ version: number; value: string }>;
  trustedOrigins: string[];
}

export function resolveAuthRuntime(
  runtime: AuthRuntimeEnvironment,
  nodeEnvironment?: string,
): AuthRuntimeConfig {
  const appEnvironment = resolveApplicationEnvironment(runtime.APP_ENV, nodeEnvironment);
  const configuredURL = runtime.BETTER_AUTH_URL
    ?? (appEnvironment === "production" ? undefined : runtime.NEXT_PUBLIC_SITE_URL);
  if (appEnvironment === "production" && !runtime.BETTER_AUTH_URL) {
    throw new Error("BETTER_AUTH_URL is required in production");
  }

  const parsedURL = parseBaseURL(configuredURL ?? "http://localhost:3000");
  const local = LOCAL_HOSTS.has(parsedURL.hostname);
  if (appEnvironment === "production" && (
    parsedURL.protocol !== "https:"
    || local
    || parsedURL.pathname !== "/"
    || parsedURL.search
    || parsedURL.hash
  )) {
    throw new Error("BETTER_AUTH_URL must be a public HTTPS origin in production");
  }
  if (runtime.NEXT_PUBLIC_SITE_URL && new URL(runtime.NEXT_PUBLIC_SITE_URL).origin !== parsedURL.origin) {
    throw new Error("NEXT_PUBLIC_SITE_URL must match BETTER_AUTH_URL");
  }

  const secrets = parseVersionedSecrets(runtime.BETTER_AUTH_SECRETS);
  const secret = runtime.BETTER_AUTH_SECRET
    ?? secrets?.[0]?.value
    ?? (appEnvironment !== "production" && local ? DEVELOPMENT_SECRET : undefined);
  if (!secret || (appEnvironment === "production" && !isAcceptableProductionSecret(secret))) {
    throw new Error("A high-entropy BETTER_AUTH_SECRET is required in production");
  }
  if (appEnvironment === "production" && secrets?.some((item) => !isAcceptableProductionSecret(item.value))) {
    throw new Error("Every BETTER_AUTH_SECRETS entry must be high entropy in production");
  }
  if (appEnvironment === "production" && (
    !runtime.PROMO_REDEMPTION_PEPPER
    || !isAcceptableProductionSecret(runtime.PROMO_REDEMPTION_PEPPER)
    || runtime.PROMO_REDEMPTION_PEPPER === secret
  )) {
    throw new Error("A separate high-entropy PROMO_REDEMPTION_PEPPER is required in production");
  }
  if (appEnvironment === "production" && (
    !runtime.MAINTENANCE_SECRET
    || !isAcceptableProductionSecret(runtime.MAINTENANCE_SECRET)
    || runtime.MAINTENANCE_SECRET === secret
    || runtime.MAINTENANCE_SECRET === runtime.PROMO_REDEMPTION_PEPPER
  )) {
    throw new Error("A separate high-entropy MAINTENANCE_SECRET is required in production");
  }

  const configuredTrustedOrigins = parseTrustedOrigins(
    runtime.BETTER_AUTH_TRUSTED_ORIGINS,
    appEnvironment,
  );

  return {
    appEnvironment,
    baseURL: parsedURL.origin,
    local,
    developmentCapture: appEnvironment !== "production"
      && local
      && runtime.AUTH_DEV_CAPTURE === "true",
    secret,
    ...(secrets ? { secrets } : {}),
    trustedOrigins: appEnvironment === "production"
      ? Array.from(new Set([parsedURL.origin, ...configuredTrustedOrigins]))
      : Array.from(new Set([
          parsedURL.origin,
          "http://localhost:3000",
          "http://127.0.0.1:3000",
        ])),
  };
}

function resolveApplicationEnvironment(
  explicit: string | undefined,
  nodeEnvironment: string | undefined,
): ApplicationEnvironment {
  if (explicit === "development" || explicit === "test" || explicit === "production") return explicit;
  if (explicit) throw new Error("APP_ENV must be development, test, or production");
  if (nodeEnvironment === "test") return "test";
  throw new Error("APP_ENV must be explicitly configured");
}

function parseBaseURL(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("BETTER_AUTH_URL must be an absolute HTTP(S) URL");
  }
  if (!new Set(["http:", "https:"]).has(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("BETTER_AUTH_URL must be an absolute HTTP(S) URL");
  }
  return parsed;
}

function parseTrustedOrigins(value: string | undefined, environment: ApplicationEnvironment) {
  if (!value?.trim()) return [];
  return value.split(",").map((entry) => {
    const raw = entry.trim();
    if (!raw || raw.includes("*")) throw new Error("Trusted origins must be exact origins");
    const parsed = parseBaseURL(raw);
    if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
      throw new Error("Trusted origins must not contain a path, query, or fragment");
    }
    if (environment === "production" && (
      parsed.protocol !== "https:" || LOCAL_HOSTS.has(parsed.hostname)
    )) {
      throw new Error("Production trusted origins must use public HTTPS origins");
    }
    return parsed.origin;
  });
}

function isAcceptableProductionSecret(value: string) {
  if (value.length < 32) return false;
  const normalized = value.toLowerCase();
  if (/(change|replace|example|secret|password|jianji|local|do-not-use)/.test(normalized)) return false;
  const unique = new Set(value).size;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/]
    .filter((pattern) => pattern.test(value)).length;
  return unique >= 12 && classes >= 3;
}

function parseVersionedSecrets(value: string | undefined) {
  if (!value?.trim()) return undefined;
  const seen = new Set<number>();
  const parsed = value.split(",").map((entry) => {
    const separator = entry.indexOf(":");
    const version = Number(entry.slice(0, separator));
    const secret = entry.slice(separator + 1).trim();
    if (separator < 1 || !Number.isSafeInteger(version) || version < 1 || secret.length < 32 || seen.has(version)) {
      throw new Error("BETTER_AUTH_SECRETS must contain unique version:secret entries with 32+ character secrets");
    }
    seen.add(version);
    return { version, value: secret };
  });
  return parsed.sort((left, right) => right.version - left.version);
}
