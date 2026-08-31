import { env } from "cloudflare:workers";
import { targetProfiles, templates } from "@/lib/sample-data";
import { auth } from "@/lib/auth";

const SESSION_COOKIE = "jianji_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const CATALOG_VERSION = 3;
let initialization: Promise<void> | undefined;

export interface GuestSession {
  userId: string;
  setCookie?: string;
  kind?: "guest" | "user";
  role?: string;
  name?: string;
  email?: string;
}

export class SessionRateLimitError extends Error {
  constructor() {
    super("Too many guest sessions");
    this.name = "SessionRateLimitError";
  }
}

export function getDatabase() {
  if (!env.DB) {
    throw new Error("D1 binding DB is unavailable");
  }
  return env.DB;
}

export async function ensureDatabase() {
  initialization ??= initializeDatabase().catch((error) => {
    initialization = undefined;
    throw error;
  });
  return initialization;
}

export async function getOrCreateSession(request: Request): Promise<GuestSession> {
  const current = await getExistingSession(request);
  if (current) return current;

  const db = getDatabase();
  const networkHash = await getRequestNetworkHash(request);
  const sessionUsageId = await reserveGuestSessionCreation(db, networkHash);
  if (!sessionUsageId) throw new SessionRateLimitError();

  try {
    const nextToken = randomToken();
    const userId = `guest-${crypto.randomUUID()}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString();
    await db.batch([
      db
        .prepare("INSERT INTO users (id, name, email, email_verified, role, banned, phone_number_verified, created_at, updated_at) VALUES (?, ?, ?, 0, 'user', 0, 0, ?, ?)")
        .bind(userId, "访客用户", `${userId}@guest.jianji.local`, now.toISOString(), now.toISOString()),
      db
        .prepare("INSERT INTO guest_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
        .bind(await hashToken(nextToken), userId, expiresAt, now.toISOString()),
    ]);

    const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
    return {
      userId,
      kind: "guest",
      setCookie: `${SESSION_COOKIE}=${nextToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`,
    };
  } catch (error) {
    await db.prepare("DELETE FROM guest_session_usage_events WHERE id = ?").bind(sessionUsageId).run().catch(() => undefined);
    throw error;
  }
}

export async function getExistingSession(request: Request): Promise<GuestSession | null> {
  await ensureDatabase();
  const authenticated = await auth.api.getSession({ headers: request.headers });
  if (authenticated?.user) {
    const user = authenticated.user as typeof authenticated.user & { role?: string };
    return {
      userId: user.id,
      kind: "user",
      role: user.role ?? "user",
      name: user.name,
      email: user.email,
    };
  }
  return getGuestSession(request);
}

export async function getGuestSession(request: Request): Promise<GuestSession | null> {
  await ensureDatabase();
  const db = getDatabase();
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    const tokenHash = await hashToken(token);
    const existing = await db
      .prepare("SELECT user_id FROM guest_sessions WHERE token_hash = ? AND expires_at > ?")
      .bind(tokenHash, new Date().toISOString())
      .first<{ user_id: string }>();
    if (existing) return { userId: existing.user_id, kind: "guest" };
  }
  return null;
}

export function withSessionCookie<T extends Response>(response: T, session: GuestSession): T {
  if (session.setCookie) response.headers.append("set-cookie", session.setCookie);
  response.headers.set("cache-control", "private, no-store");
  return response;
}

async function initializeDatabase() {
  const db = getDatabase();
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      email_verified INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      banned INTEGER NOT NULL DEFAULT 0,
      ban_reason TEXT,
      ban_expires TEXT,
      phone_number TEXT,
      phone_number_verified INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS guest_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS catalog_meta (
      key TEXT PRIMARY KEY,
      version INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      track TEXT NOT NULL,
      accent TEXT NOT NULL,
      layout TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      recommended_for_json TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS target_profiles (
      id TEXT PRIMARY KEY,
      track TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      region TEXT NOT NULL,
      description TEXT NOT NULL,
      keywords_json TEXT NOT NULL,
      priorities_json TEXT NOT NULL,
      tone TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'editorial',
      reviewed_at TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS resumes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      track TEXT NOT NULL,
      target_profile_id TEXT REFERENCES target_profiles(id),
      target_name TEXT NOT NULL,
      template_id TEXT NOT NULL REFERENCES templates(id),
      status TEXT NOT NULL DEFAULT 'draft',
      progress INTEGER NOT NULL DEFAULT 0,
      revision INTEGER NOT NULL DEFAULT 1,
      schema_version INTEGER NOT NULL DEFAULT 1,
      content_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS resume_versions (
      id TEXT PRIMARY KEY,
      resume_id TEXT NOT NULL REFERENCES resumes(id),
      revision INTEGER NOT NULL,
      content_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(resume_id, revision)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS resume_target_briefs (
      resume_id TEXT PRIMARY KEY REFERENCES resumes(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      kind TEXT NOT NULL,
      focus_name TEXT NOT NULL,
      requirements_text TEXT NOT NULL DEFAULT '',
      source_type TEXT NOT NULL DEFAULT 'manual',
      source_url TEXT,
      captured_at TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS suggestion_events (
      id TEXT PRIMARY KEY,
      resume_id TEXT REFERENCES resumes(id),
      target_profile_id TEXT,
      section TEXT NOT NULL,
      score INTEGER NOT NULL,
      provider TEXT NOT NULL DEFAULT 'local-rules',
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS guest_session_usage_events (
      id TEXT PRIMARY KEY,
      network_hash TEXT,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS advice_usage_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      network_hash TEXT,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS model_usage_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      network_hash TEXT,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS model_request_leases (
      slot INTEGER PRIMARY KEY,
      request_id TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS model_session_leases (
      owner_key TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS model_consent_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      resume_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      purpose TEXT NOT NULL,
      consent_version TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS model_provider_state (
      provider_key TEXT PRIMARY KEY,
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      open_until TEXT,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_templates_track_active ON templates(track, active)"),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_target_profiles_track_active ON target_profiles(track, active)",
    ),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_resumes_user_updated ON resumes(user_id, updated_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_resumes_user_status ON resumes(user_id, status)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_resume_target_briefs_user_updated ON resume_target_briefs(user_id, updated_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_guest_sessions_user ON guest_sessions(user_id)"),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_suggestion_events_resume ON suggestion_events(resume_id, created_at)",
    ),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_guest_session_usage_network_created ON guest_session_usage_events(network_hash, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_guest_session_usage_created ON guest_session_usage_events(created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_advice_usage_user_created ON advice_usage_events(user_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_advice_usage_network_created ON advice_usage_events(network_hash, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_advice_usage_created ON advice_usage_events(created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_model_usage_user_created ON model_usage_events(user_id, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_model_usage_network_created ON model_usage_events(network_hash, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_model_usage_created ON model_usage_events(created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_model_consent_resume_created ON model_consent_events(resume_id, created_at)"),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_audit_events_resource ON audit_events(resource_type, resource_id)",
    ),
  ]);

  await ensureAuthSchema(db);

  const now = new Date().toISOString();
  const catalogState = await db
    .prepare("SELECT version FROM catalog_meta WHERE key = 'core'")
    .first<{ version: number }>();
  if (Number(catalogState?.version ?? 0) < CATALOG_VERSION) {
    const templateStatements = Array.from(
      { length: Math.ceil(templates.length / 9) },
      (_, chunkIndex) => {
        const chunk = templates.slice(chunkIndex * 9, chunkIndex * 9 + 9);
        const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
        const values = chunk.flatMap((template) => [
          template.id,
          template.name,
          template.description,
          template.track,
          template.accent,
          template.layout,
          JSON.stringify(template.tags),
          JSON.stringify(template.recommendedFor),
          template.active ? 1 : 0,
          now,
          now,
        ]);
        return db
          .prepare(`INSERT INTO templates
        (id, name, description, track, accent, layout, tags_json, recommended_for_json, active, created_at, updated_at)
        VALUES ${placeholders}
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          track = excluded.track,
          accent = excluded.accent,
          layout = excluded.layout,
          tags_json = excluded.tags_json,
          recommended_for_json = excluded.recommended_for_json,
          active = excluded.active,
          updated_at = excluded.updated_at`)
          .bind(...values);
      },
    );
    if (templateStatements.length) await db.batch(templateStatements);

    const profileStatements = Array.from(
      { length: Math.ceil(targetProfiles.length / 10) },
      (_, chunkIndex) => {
        const chunk = targetProfiles.slice(chunkIndex * 10, chunkIndex * 10 + 10);
        const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, 'editorial', ?, 1)").join(", ");
        const values = chunk.flatMap((profile) => [
          profile.id,
          profile.track,
          profile.name,
          profile.category,
          profile.region,
          profile.description,
          JSON.stringify(profile.keywords),
          JSON.stringify(profile.priorities),
          profile.tone,
          "2026-08-30",
        ]);
        return db
          .prepare(`INSERT INTO target_profiles
        (id, track, name, category, region, description, keywords_json, priorities_json, tone, source_type, reviewed_at, active)
        VALUES ${placeholders}
        ON CONFLICT(id) DO UPDATE SET
          track = excluded.track,
          name = excluded.name,
          category = excluded.category,
          region = excluded.region,
          description = excluded.description,
          keywords_json = excluded.keywords_json,
          priorities_json = excluded.priorities_json,
          tone = excluded.tone,
          source_type = excluded.source_type,
          reviewed_at = excluded.reviewed_at,
          active = excluded.active`)
          .bind(...values);
      },
    );
    if (profileStatements.length) await db.batch(profileStatements);

    await db
      .prepare(`INSERT INTO catalog_meta (key, version, updated_at) VALUES ('core', ?, ?)
      ON CONFLICT(key) DO UPDATE SET version = excluded.version, updated_at = excluded.updated_at`)
      .bind(CATALOG_VERSION, now)
      .run();
  }
}

async function ensureAuthSchema(db: ReturnType<typeof getDatabase>) {
  const columns = await db.prepare("PRAGMA table_info(users)").all<{ name: string }>();
  const existing = new Set(columns.results.map((column) => column.name));
  const additions = [
    ["email_verified", "INTEGER NOT NULL DEFAULT 0"],
    ["image", "TEXT"],
    ["updated_at", "TEXT"],
    ["banned", "INTEGER NOT NULL DEFAULT 0"],
    ["ban_reason", "TEXT"],
    ["ban_expires", "TEXT"],
    ["phone_number", "TEXT"],
    ["phone_number_verified", "INTEGER NOT NULL DEFAULT 0"],
  ] as const;
  for (const [name, definition] of additions) {
    if (!existing.has(name)) await db.prepare(`ALTER TABLE users ADD COLUMN ${name} ${definition}`).run();
  }
  await db.prepare("UPDATE users SET updated_at = created_at WHERE updated_at IS NULL OR updated_at = ''").run();

  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      expires_at TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      impersonated_by TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS auth_accounts (
      id TEXT PRIMARY KEY,
      issuer TEXT NOT NULL,
      account_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      access_token TEXT,
      refresh_token TEXT,
      id_token TEXT,
      access_token_expires_at TEXT,
      refresh_token_expires_at TEXT,
      scope TEXT,
      password TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(issuer, account_id)
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS auth_verifications (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS auth_rate_limits (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      count INTEGER NOT NULL,
      last_request INTEGER NOT NULL
    )`),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_number ON users(phone_number)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_auth_accounts_user_id ON auth_accounts(user_id)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_accounts_issuer_account ON auth_accounts(issuer, account_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_auth_verifications_identifier ON auth_verifications(identifier)"),
  ]);
}

export async function recordAudit(
  actorId: string,
  action: string,
  resourceType: string,
  resourceId: string,
  metadata: Record<string, unknown> = {},
) {
  const db = getDatabase();
  await db
    .prepare(`INSERT INTO audit_events
      (id, actor_id, action, resource_type, resource_id, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      crypto.randomUUID(),
      actorId,
      action,
      resourceType,
      resourceId,
      JSON.stringify(metadata),
      new Date().toISOString(),
    )
    .run();
}

function readCookie(header: string | null, name: string) {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return undefined;
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function getRequestNetworkHash(request: Request) {
  const address = request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!address || address.length > 100) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(address));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function reserveGuestSessionCreation(
  db: ReturnType<typeof getDatabase>,
  networkHash: string | null,
) {
  const now = new Date();
  const nowIso = now.toISOString();
  const hourStart = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000).toISOString();
  const dayStart = new Date(Math.floor(now.getTime() / 86_400_000) * 86_400_000).toISOString();
  const cleanupBefore = new Date(now.getTime() - 172_800_000).toISOString();
  await db.prepare("DELETE FROM guest_session_usage_events WHERE created_at < ?")
    .bind(cleanupBefore)
    .run()
    .catch(() => undefined);
  const id = crypto.randomUUID();
  const reserved = await db.prepare(`INSERT INTO guest_session_usage_events (id, network_hash, created_at)
    SELECT ?, ?, ?
    WHERE (? IS NULL OR (SELECT COUNT(*) FROM guest_session_usage_events WHERE network_hash = ? AND created_at >= ?) < 30)
      AND (? IS NULL OR (SELECT COUNT(*) FROM guest_session_usage_events WHERE network_hash = ? AND created_at >= ?) < 100)
      AND (SELECT COUNT(*) FROM guest_session_usage_events WHERE created_at >= ?) < 1000
    RETURNING id`)
    .bind(
      id,
      networkHash,
      nowIso,
      networkHash,
      networkHash,
      hourStart,
      networkHash,
      networkHash,
      dayStart,
      dayStart,
    )
    .first<{ id: string }>();
  return reserved?.id ?? null;
}
