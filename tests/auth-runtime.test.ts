import { describe, expect, it } from "vitest";
import { resolveAuthRuntime } from "@/lib/auth-runtime";

describe("authentication runtime policy", () => {
  it("does not infer a development environment when APP_ENV is absent", () => {
    expect(() => resolveAuthRuntime({}, undefined)).toThrow();
  });
  it("fails closed when production identity configuration is missing or local", () => {
    expect(() => resolveAuthRuntime({ APP_ENV: "production" }, "production")).toThrow();
    expect(() => resolveAuthRuntime({
      APP_ENV: "production",
      BETTER_AUTH_URL: "http://localhost:3000",
      BETTER_AUTH_SECRET: "x".repeat(48),
    }, "production")).toThrow();
  });

  it("accepts only an HTTPS production origin and excludes localhost trust", () => {
    const config = resolveAuthRuntime({
      APP_ENV: "production",
      BETTER_AUTH_URL: "https://cv.example.com",
      BETTER_AUTH_SECRET: "AH8x2!qZk4#vL9@pR6$mT3&yW7*nC5+e",
      PROMO_REDEMPTION_PEPPER: "Q3!vN7@rT2#kP8$mL4&wX9*zC6+hF5^s",
      MAINTENANCE_SECRET: "M8@rK2!wP7#zD4$vN9&xH5+qT3^cL6%j",
      AUTH_DEV_CAPTURE: "true",
    }, "production");
    expect(config.baseURL).toBe("https://cv.example.com");
    expect(config.trustedOrigins).toEqual(["https://cv.example.com"]);
    expect(config.developmentCapture).toBe(false);
  });

  it("requires a separate production promo-redemption pepper", () => {
    expect(() => resolveAuthRuntime({
      APP_ENV: "production",
      BETTER_AUTH_URL: "https://cv.example.com",
      BETTER_AUTH_SECRET: "AH8x2!qZk4#vL9@pR6$mT3&yW7*nC5+e",
    }, "production")).toThrow("PROMO_REDEMPTION_PEPPER");
    expect(() => resolveAuthRuntime({
      APP_ENV: "production",
      BETTER_AUTH_URL: "https://cv.example.com",
      BETTER_AUTH_SECRET: "AH8x2!qZk4#vL9@pR6$mT3&yW7*nC5+e",
      PROMO_REDEMPTION_PEPPER: "AH8x2!qZk4#vL9@pR6$mT3&yW7*nC5+e",
    }, "production")).toThrow("PROMO_REDEMPTION_PEPPER");
  });

  it("requires a separate production maintenance secret", () => {
    const base = {
      APP_ENV: "production",
      BETTER_AUTH_URL: "https://cv.example.com",
      BETTER_AUTH_SECRET: "AH8x2!qZk4#vL9@pR6$mT3&yW7*nC5+e",
      PROMO_REDEMPTION_PEPPER: "Q3!vN7@rT2#kP8$mL4&wX9*zC6+hF5^s",
    } as const;
    expect(() => resolveAuthRuntime(base, "production")).toThrow("MAINTENANCE_SECRET");
    expect(() => resolveAuthRuntime({
      ...base,
      MAINTENANCE_SECRET: base.PROMO_REDEMPTION_PEPPER,
    }, "production")).toThrow("MAINTENANCE_SECRET");
  });

  it("rejects production URL paths, wildcards, and predictable secrets", () => {
    expect(() => resolveAuthRuntime({
      APP_ENV: "production",
      BETTER_AUTH_URL: "https://cv.example.com/path",
      BETTER_AUTH_SECRET: "AH8x2!qZk4#vL9@pR6$mT3&yW7*nC5+e",
      PROMO_REDEMPTION_PEPPER: "Q3!vN7@rT2#kP8$mL4&wX9*zC6+hF5^s",
    }, "production")).toThrow();
    expect(() => resolveAuthRuntime({
      APP_ENV: "production",
      BETTER_AUTH_URL: "https://cv.example.com",
      BETTER_AUTH_SECRET: "x".repeat(48),
      PROMO_REDEMPTION_PEPPER: "Q3!vN7@rT2#kP8$mL4&wX9*zC6+hF5^s",
    }, "production")).toThrow();
    expect(() => resolveAuthRuntime({
      APP_ENV: "production",
      BETTER_AUTH_URL: "https://cv.example.com",
      BETTER_AUTH_SECRET: "AH8x2!qZk4#vL9@pR6$mT3&yW7*nC5+e",
      PROMO_REDEMPTION_PEPPER: "Q3!vN7@rT2#kP8$mL4&wX9*zC6+hF5^s",
      BETTER_AUTH_TRUSTED_ORIGINS: "https://*.example.com",
    }, "production")).toThrow();
    expect(() => resolveAuthRuntime({
      APP_ENV: "production",
      BETTER_AUTH_URL: "https://cv.example.com",
      BETTER_AUTH_SECRET: "AH8x2!qZk4#vL9@pR6$mT3&yW7*nC5+e",
      BETTER_AUTH_SECRETS: `2:${"x".repeat(40)}`,
    }, "production")).toThrow();
  });

  it("requires an explicit local capture flag and supports ordered secret rotation", () => {
    const config = resolveAuthRuntime({
      APP_ENV: "development",
      BETTER_AUTH_URL: "http://localhost:3000",
      AUTH_DEV_CAPTURE: "true",
      BETTER_AUTH_SECRETS: `1:${"a".repeat(40)},2:${"b".repeat(40)}`,
    }, "development");
    expect(config.developmentCapture).toBe(true);
    expect(config.secrets?.map((item) => item.version)).toEqual([2, 1]);
    expect(config.secret).toBe("b".repeat(40));
  });
});
