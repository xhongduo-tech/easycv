import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { getDatabase } from "@/../db";
import {
  ACCOUNT_EXPORT_MAX_CONTENT_BYTES,
  ACCOUNT_EXPORT_MAX_RECORDS,
  AccountExportTooLargeError,
  assertAccountExportEstimate,
  buildAccountExport,
} from "@/lib/account-export";

type Database = ReturnType<typeof getDatabase>;

describe("account data export", () => {
  it("accepts an export estimate at the configured limits", () => {
    expect(() => assertAccountExportEstimate({
      recordCount: ACCOUNT_EXPORT_MAX_RECORDS,
      contentBytes: ACCOUNT_EXPORT_MAX_CONTENT_BYTES,
    })).not.toThrow();
  });

  it("rejects an export estimate above the record limit", () => {
    expect(() => assertAccountExportEstimate({
      recordCount: ACCOUNT_EXPORT_MAX_RECORDS + 1,
      contentBytes: 0,
    })).toThrow(AccountExportTooLargeError);
  });

  it("rejects an export estimate above the content-byte limit", () => {
    expect(() => assertAccountExportEstimate({
      recordCount: 1,
      contentBytes: ACCOUNT_EXPORT_MAX_CONTENT_BYTES + 1,
    })).toThrow(AccountExportTooLargeError);
  });

  it("exports user-owned records without authentication or replay secrets", async () => {
    const adapter = createDatabase();
    const now = "2026-09-01T00:00:00.000Z";
    adapter.sqlite.exec(`
      INSERT INTO users
        (id, name, email, email_verified, role, banned, phone_number_verified,
         two_factor_enabled, created_at, updated_at)
        VALUES ('user-1', 'Export User', 'export@example.com', 1, 'user', 0, 0, 1, '${now}', '${now}');
      INSERT INTO auth_accounts
        (id, issuer, account_id, provider_id, user_id, access_token, refresh_token, id_token,
         password, created_at, updated_at)
        VALUES ('account-1', 'github', 'provider-user', 'github', 'user-1',
          'ACCESS_SENTINEL', 'REFRESH_SENTINEL', 'ID_SENTINEL', 'PASSWORD_SENTINEL', '${now}', '${now}');
      INSERT INTO auth_sessions
        (id, expires_at, token, created_at, updated_at, user_id, admin_mfa_verified_at)
        VALUES ('session-1', '2026-09-02T00:00:00.000Z', 'SESSION_SENTINEL', '${now}', '${now}', 'user-1', '${now}');
      INSERT INTO auth_two_factors
        (id, secret, backup_codes, user_id, verified)
        VALUES ('factor-1', 'TOTP_SENTINEL', 'BACKUP_SENTINEL', 'user-1', 1);
      INSERT INTO model_advice_deliveries
        (request_id, user_id, resume_id, request_fingerprint, response_json, attempt_state,
         updated_at, created_at, expires_at, terminal_at)
        VALUES ('request-1', 'user-1', 'resume-1', 'FINGERPRINT_SENTINEL',
          '{"private":"REPLAY_SENTINEL"}', 'succeeded', '${now}', '${now}',
          '2026-09-01T00:15:00.000Z', '${now}');
    `);

    const payload = await buildAccountExport(
      adapter as unknown as Database,
      "user-1",
      now,
    );
    expect(payload).toMatchObject({
      schemaVersion: 1,
      generatedAt: now,
      user: { id: "user-1", email: "export@example.com" },
      identity: { accounts: [{ provider_id: "github" }], sessions: [{ id: "session-1" }] },
      aiCredits: { requestHistory: [{ request_id: "request-1", attempt_state: "succeeded" }] },
    });

    const serialized = JSON.stringify(payload);
    for (const sentinel of [
      "ACCESS_SENTINEL",
      "REFRESH_SENTINEL",
      "ID_SENTINEL",
      "PASSWORD_SENTINEL",
      "SESSION_SENTINEL",
      "TOTP_SENTINEL",
      "BACKUP_SENTINEL",
      "FINGERPRINT_SENTINEL",
      "REPLAY_SENTINEL",
    ]) expect(serialized).not.toContain(sentinel);
    expect(recursiveKeys(payload)).not.toEqual(expect.arrayContaining([
      "access_token",
      "refresh_token",
      "id_token",
      "password",
      "token",
      "secret",
      "backup_codes",
      "request_fingerprint",
      "response_json",
    ]));
  });
});

function recursiveKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(recursiveKeys);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, nested]) => [key, ...recursiveKeys(nested)]);
}

function createDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const migrationDirectory = resolve(process.cwd(), "drizzle");
  for (const migration of readdirSync(migrationDirectory).filter((name) => /^\d+_.+\.sql$/.test(name)).sort()) {
    sqlite.exec(readFileSync(resolve(migrationDirectory, migration), "utf8")
      .replaceAll("--> statement-breakpoint", ""));
  }
  return {
    sqlite,
    prepare: (sql: string) => new Statement(sqlite, sql),
  };
}

class Statement {
  private values: unknown[] = [];
  constructor(private readonly sqlite: DatabaseSync, private readonly sql: string) {}
  bind(...values: unknown[]) { this.values = values; return this; }
  async first<T>() {
    return (this.sqlite.prepare(this.sql).get(...this.values as never[]) ?? null) as T | null;
  }
  async all<T>() {
    return { results: this.sqlite.prepare(this.sql).all(...this.values as never[]) as T[] };
  }
}
