import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { getDatabase } from "@/../db";
import { acquireOwnerLease, releaseOwnerLease, renewOwnerLease } from "@/lib/owner-lease";

type Database = ReturnType<typeof getDatabase>;

describe("owner lifecycle lease", () => {
  it("allows exactly one model-or-lifecycle owner and preserves a newer takeover", async () => {
    const adapter = createDatabase();
    adapter.sqlite.prepare("INSERT INTO users VALUES ('user-1')").run();
    const now = new Date("2026-09-01T00:00:00.000Z");

    const model = await acquireOwnerLease(adapter as unknown as Database, "user-1", "request-1", 60_000, now);
    expect(model.lease).not.toBeNull();
    const claim = await acquireOwnerLease(
      adapter as unknown as Database,
      "user-1",
      "lifecycle:claim:1",
      60_000,
      now,
    );
    expect(claim.lease).toBeNull();
    expect(claim.blockingOperationId).toBe("request-1");

    await releaseOwnerLease(adapter as unknown as Database, model.lease!);
    const lifecycle = await acquireOwnerLease(
      adapter as unknown as Database,
      "user-1",
      "lifecycle:delete:1",
      60_000,
      now,
    );
    expect(lifecycle.lease).not.toBeNull();

    // A late finally from the old request is scoped by operation id.
    await releaseOwnerLease(adapter as unknown as Database, model.lease!);
    const current = adapter.sqlite.prepare("SELECT request_id FROM model_session_leases WHERE owner_key = 'user-1'").get() as { request_id: string };
    expect(current.request_id).toBe(lifecycle.lease!.leaseId);
  });

  it("rejects a stale request after claim/delete removed the owner", async () => {
    const adapter = createDatabase();
    adapter.sqlite.prepare("INSERT INTO users VALUES ('guest-1')").run();
    // The request saw its resume before the lifecycle transaction won.
    expect(adapter.sqlite.prepare("SELECT id FROM users WHERE id = 'guest-1'").get()).toEqual({ id: "guest-1" });
    const lifecycle = await acquireOwnerLease(
      adapter as unknown as Database,
      "guest-1",
      "lifecycle:claim:1",
      60_000,
      new Date("2026-09-01T00:00:00.000Z"),
    );
    expect(lifecycle.lease).not.toBeNull();
    adapter.sqlite.exec("BEGIN");
    adapter.sqlite.prepare("DELETE FROM users WHERE id = 'guest-1'").run();
    adapter.sqlite.prepare(`DELETE FROM model_session_leases
      WHERE owner_key = 'guest-1' AND request_id = ?`).run(lifecycle.lease!.leaseId);
    adapter.sqlite.exec("COMMIT");

    const staleRequest = await acquireOwnerLease(
      adapter as unknown as Database,
      "guest-1",
      "request-stale",
      60_000,
      new Date("2026-09-01T00:00:01.000Z"),
    );
    expect(staleRequest.lease).toBeNull();
    expect(adapter.sqlite.prepare("SELECT * FROM model_session_leases").all()).toEqual([]);
  });

  it("allows an expired lease to be recovered", async () => {
    const adapter = createDatabase();
    adapter.sqlite.prepare("INSERT INTO users VALUES ('user-1')").run();
    adapter.sqlite.prepare(`INSERT INTO model_session_leases
      VALUES ('user-1', 'request-crashed', '2026-09-01T00:00:01.000Z')`).run();
    const recovered = await acquireOwnerLease(
      adapter as unknown as Database,
      "user-1",
      "lifecycle:delete:retry",
      60_000,
      new Date("2026-09-01T00:00:02.000Z"),
    );
    expect(recovered.lease).not.toBeNull();
  });

  it("fences a late release after the same logical request takes over", async () => {
    const adapter = createDatabase();
    adapter.sqlite.prepare("INSERT INTO users VALUES ('user-1')").run();
    const first = await acquireOwnerLease(
      adapter as unknown as Database,
      "user-1",
      "same-request",
      1_000,
      new Date("2026-09-01T00:00:00.000Z"),
    );
    const takeover = await acquireOwnerLease(
      adapter as unknown as Database,
      "user-1",
      "same-request",
      60_000,
      new Date("2026-09-01T00:00:02.000Z"),
    );
    expect(takeover.lease).not.toBeNull();
    expect(takeover.lease!.leaseId).not.toBe(first.lease!.leaseId);

    await releaseOwnerLease(adapter as unknown as Database, first.lease!);
    expect(adapter.sqlite.prepare("SELECT request_id FROM model_session_leases WHERE owner_key = 'user-1'").get())
      .toEqual({ request_id: takeover.lease!.leaseId });
  });

  it("renews only the exact lease before it expires", async () => {
    const adapter = createDatabase();
    adapter.sqlite.prepare("INSERT INTO users VALUES ('user-1')").run();
    const acquired = await acquireOwnerLease(
      adapter as unknown as Database,
      "user-1",
      "request-1",
      10_000,
      new Date("2026-09-01T00:00:00.000Z"),
    );
    expect(await renewOwnerLease(
      adapter as unknown as Database,
      acquired.lease!,
      60_000,
      new Date("2026-09-01T00:00:05.000Z"),
    )).toBe(true);
    expect(await renewOwnerLease(
      adapter as unknown as Database,
      { ...acquired.lease!, leaseId: "stale-worker" },
      60_000,
      new Date("2026-09-01T00:00:06.000Z"),
    )).toBe(false);
  });
});

function createDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE model_session_leases (
      owner_key TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
  `);
  return {
    sqlite,
    prepare(sql: string) {
      return new Statement(sqlite, sql);
    },
  };
}

class Statement {
  private values: unknown[] = [];

  constructor(private readonly sqlite: DatabaseSync, private readonly sql: string) {}

  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }

  async first<T>() {
    return (this.sqlite.prepare(this.sql).get(...this.values as never[]) ?? null) as T | null;
  }

  async run() {
    return this.sqlite.prepare(this.sql).run(...this.values as never[]);
  }
}
