import { describe, expect, it } from "vitest";
import { authRoles } from "@/lib/auth-access";
import { normalizeMainlandPhone, passwordIssue, safeReturnTo } from "@/lib/auth-utils";

describe("authentication redirects", () => {
  it("keeps local destinations and rejects external redirects", () => {
    expect(safeReturnTo("/builder/abc?from=login#resume")).toBe("/builder/abc?from=login#resume");
    expect(safeReturnTo("//evil.example/path")).toBe("/dashboard");
    expect(safeReturnTo("https://evil.example/path")).toBe("/dashboard");
    expect(safeReturnTo(null, "/")).toBe("/");
  });
});

describe("mainland phone normalization", () => {
  it("normalizes supported mainland formats", () => {
    expect(normalizeMainlandPhone("138 0013 8000")).toBe("+8613800138000");
    expect(normalizeMainlandPhone("8613800138000")).toBe("+8613800138000");
    expect(normalizeMainlandPhone("+86 (138) 0013-8000")).toBe("+8613800138000");
  });

  it("rejects invalid or non-mainland numbers", () => {
    expect(normalizeMainlandPhone("12800138000")).toBeNull();
    expect(normalizeMainlandPhone("+12025550123")).toBeNull();
    expect(normalizeMainlandPhone("1380013800")).toBeNull();
  });
});

describe("password policy", () => {
  it("requires length plus letters and digits", () => {
    expect(passwordIssue("short1")).toBe("密码至少需要 12 位");
    expect(passwordIssue("abcdefghijkl")).toBe("密码需同时包含字母和数字");
    expect(passwordIssue("123456789012")).toBe("密码需同时包含字母和数字");
    expect(passwordIssue("jianji-secure-2026")).toBe("");
  });
});

describe("administrator permissions", () => {
  it("allows only user listing, role changes, and ban management", () => {
    expect(authRoles.admin.authorize({ user: ["list", "set-role", "ban"] }).success).toBe(true);
    expect(authRoles.admin.authorize({ user: ["impersonate"] }).success).toBe(false);
    expect(authRoles.admin.authorize({ user: ["set-password"] }).success).toBe(false);
    expect(authRoles.admin.authorize({ user: ["delete"] }).success).toBe(false);
    expect(authRoles.admin.authorize({ user: ["set-email"] }).success).toBe(false);
    expect(authRoles.admin.authorize({ session: ["revoke"] }).success).toBe(false);
    expect(authRoles.user.authorize({ user: ["list"] }).success).toBe(false);
  });
});
