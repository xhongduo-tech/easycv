import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    role: text("role").notNull().default("user"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("idx_users_email").on(table.email)],
);

export const guestSessions = sqliteTable(
  "guest_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_guest_sessions_user").on(table.userId)],
);

export const catalogMeta = sqliteTable("catalog_meta", {
  key: text("key").primaryKey(),
  version: integer("version").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const templates = sqliteTable(
  "templates",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    track: text("track").notNull(),
    accent: text("accent").notNull(),
    layout: text("layout").notNull(),
    tagsJson: text("tags_json").notNull(),
    recommendedForJson: text("recommended_for_json").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_templates_track_active").on(table.track, table.active)],
);

export const targetProfiles = sqliteTable(
  "target_profiles",
  {
    id: text("id").primaryKey(),
    track: text("track").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    region: text("region").notNull(),
    description: text("description").notNull(),
    keywordsJson: text("keywords_json").notNull(),
    prioritiesJson: text("priorities_json").notNull(),
    tone: text("tone").notNull(),
    sourceType: text("source_type").notNull().default("editorial"),
    reviewedAt: text("reviewed_at").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
  },
  (table) => [index("idx_target_profiles_track_active").on(table.track, table.active)],
);

export const resumes = sqliteTable(
  "resumes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    title: text("title").notNull(),
    track: text("track").notNull(),
    targetProfileId: text("target_profile_id").references(() => targetProfiles.id),
    targetName: text("target_name").notNull(),
    templateId: text("template_id")
      .notNull()
      .references(() => templates.id),
    status: text("status").notNull().default("draft"),
    progress: integer("progress").notNull().default(0),
    revision: integer("revision").notNull().default(1),
    schemaVersion: integer("schema_version").notNull().default(1),
    contentJson: text("content_json").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    index("idx_resumes_user_updated").on(table.userId, table.updatedAt),
    index("idx_resumes_user_status").on(table.userId, table.status),
  ],
);

export const resumeVersions = sqliteTable(
  "resume_versions",
  {
    id: text("id").primaryKey(),
    resumeId: text("resume_id")
      .notNull()
      .references(() => resumes.id),
    revision: integer("revision").notNull(),
    contentJson: text("content_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("idx_resume_versions_revision").on(table.resumeId, table.revision)],
);

export const suggestionEvents = sqliteTable(
  "suggestion_events",
  {
    id: text("id").primaryKey(),
    resumeId: text("resume_id").references(() => resumes.id),
    targetProfileId: text("target_profile_id"),
    section: text("section").notNull(),
    score: integer("score").notNull(),
    provider: text("provider").notNull().default("local-rules"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_suggestion_events_resume").on(table.resumeId, table.createdAt)],
);

export const guestSessionUsageEvents = sqliteTable(
  "guest_session_usage_events",
  {
    id: text("id").primaryKey(),
    networkHash: text("network_hash"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_guest_session_usage_network_created").on(table.networkHash, table.createdAt),
    index("idx_guest_session_usage_created").on(table.createdAt),
  ],
);

export const adviceUsageEvents = sqliteTable(
  "advice_usage_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    networkHash: text("network_hash"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_advice_usage_user_created").on(table.userId, table.createdAt),
    index("idx_advice_usage_network_created").on(table.networkHash, table.createdAt),
    index("idx_advice_usage_created").on(table.createdAt),
  ],
);

export const modelUsageEvents = sqliteTable(
  "model_usage_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    networkHash: text("network_hash"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_model_usage_user_created").on(table.userId, table.createdAt),
    index("idx_model_usage_network_created").on(table.networkHash, table.createdAt),
    index("idx_model_usage_created").on(table.createdAt),
  ],
);

export const modelRequestLeases = sqliteTable("model_request_leases", {
  slot: integer("slot").primaryKey(),
  requestId: text("request_id").notNull(),
  expiresAt: text("expires_at").notNull(),
});

export const modelSessionLeases = sqliteTable("model_session_leases", {
  ownerKey: text("owner_key").primaryKey(),
  requestId: text("request_id").notNull(),
  expiresAt: text("expires_at").notNull(),
});

export const modelConsentEvents = sqliteTable(
  "model_consent_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    resumeId: text("resume_id").notNull(),
    provider: text("provider").notNull(),
    purpose: text("purpose").notNull(),
    consentVersion: text("consent_version").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_model_consent_resume_created").on(table.resumeId, table.createdAt)],
);

export const modelProviderState = sqliteTable("model_provider_state", {
  providerKey: text("provider_key").primaryKey(),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  openUntil: text("open_until"),
  updatedAt: text("updated_at").notNull(),
});

export const auditEvents = sqliteTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id").notNull(),
    metadataJson: text("metadata_json").notNull().default("{}"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_audit_events_resource").on(table.resourceType, table.resourceId)],
);
