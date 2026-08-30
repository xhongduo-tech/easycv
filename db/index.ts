import { env } from "cloudflare:workers";
import { targetProfiles, templates } from "@/lib/sample-data";

const SESSION_COOKIE = "jianji_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
let initialization: Promise<void> | undefined;

export interface GuestSession {
  userId: string;
  setCookie?: string;
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
  await ensureDatabase();
  const db = getDatabase();
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  if (token && /^[a-f0-9]{64}$/.test(token)) {
    const tokenHash = await hashToken(token);
    const existing = await db
      .prepare("SELECT user_id FROM guest_sessions WHERE token_hash = ? AND expires_at > ?")
      .bind(tokenHash, new Date().toISOString())
      .first<{ user_id: string }>();
    if (existing) return { userId: existing.user_id };
  }

  const nextToken = randomToken();
  const userId = `guest-${crypto.randomUUID()}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString();
  await db.batch([
    db
      .prepare("INSERT INTO users (id, name, email, role, created_at) VALUES (?, ?, ?, 'user', ?)")
      .bind(userId, "访客用户", `${userId}@guest.jianji.local`, now.toISOString()),
    db
      .prepare("INSERT INTO guest_sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
      .bind(await hashToken(nextToken), userId, expiresAt, now.toISOString()),
  ]);

  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return {
    userId,
    setCookie: `${SESSION_COOKIE}=${nextToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`,
  };
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
      role TEXT NOT NULL DEFAULT 'user',
      created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS guest_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
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
    db.prepare(`CREATE TABLE IF NOT EXISTS suggestion_events (
      id TEXT PRIMARY KEY,
      resume_id TEXT REFERENCES resumes(id),
      target_profile_id TEXT,
      section TEXT NOT NULL,
      score INTEGER NOT NULL,
      provider TEXT NOT NULL DEFAULT 'local-rules',
      created_at TEXT NOT NULL
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
    db.prepare("CREATE INDEX IF NOT EXISTS idx_guest_sessions_user ON guest_sessions(user_id)"),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_suggestion_events_resume ON suggestion_events(resume_id, created_at)",
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_audit_events_resource ON audit_events(resource_type, resource_id)",
    ),
  ]);

  const now = new Date().toISOString();
  const templateStatements = templates.map((template) =>
    db
      .prepare(`INSERT INTO templates
        (id, name, description, track, accent, layout, tags_json, recommended_for_json, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO NOTHING`)
      .bind(
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
      ),
  );
  if (templateStatements.length) await db.batch(templateStatements);

  const profileStatements = targetProfiles.map((profile) =>
    db
      .prepare(`INSERT INTO target_profiles
        (id, track, name, category, region, description, keywords_json, priorities_json, tone, source_type, reviewed_at, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'editorial', ?, 1)
        ON CONFLICT(id) DO NOTHING`)
      .bind(
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
      ),
  );
  if (profileStatements.length) await db.batch(profileStatements);

  await db.prepare("PRAGMA optimize").run();
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
