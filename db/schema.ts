import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
    image: text("image"),
    role: text("role").notNull().default("user"),
    banned: integer("banned", { mode: "boolean" }).notNull().default(false),
    banReason: text("ban_reason"),
    banExpires: text("ban_expires"),
    phoneNumber: text("phone_number"),
    phoneNumberVerified: integer("phone_number_verified", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_users_email").on(table.email),
    uniqueIndex("idx_users_phone_number").on(table.phoneNumber),
  ],
);

export const authSessions = sqliteTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: text("expires_at").notNull(),
    token: text("token").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    impersonatedBy: text("impersonated_by"),
  },
  (table) => [
    uniqueIndex("idx_auth_sessions_token").on(table.token),
    index("idx_auth_sessions_user_id").on(table.userId),
  ],
);

export const authAccounts = sqliteTable(
  "auth_accounts",
  {
    id: text("id").primaryKey(),
    issuer: text("issuer").notNull(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: text("access_token_expires_at"),
    refreshTokenExpiresAt: text("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_auth_accounts_issuer_account").on(table.issuer, table.accountId),
    index("idx_auth_accounts_user_id").on(table.userId),
  ],
);

export const authVerifications = sqliteTable(
  "auth_verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_auth_verifications_identifier").on(table.identifier)],
);

export const authRateLimits = sqliteTable(
  "auth_rate_limits",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    count: integer("count").notNull(),
    lastRequest: integer("last_request").notNull(),
  },
  (table) => [uniqueIndex("idx_auth_rate_limits_key").on(table.key)],
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

export const resumeTargetBriefs = sqliteTable(
  "resume_target_briefs",
  {
    resumeId: text("resume_id")
      .primaryKey()
      .references(() => resumes.id),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    kind: text("kind").notNull(),
    focusName: text("focus_name").notNull(),
    requirementsText: text("requirements_text").notNull().default(""),
    sourceType: text("source_type").notNull().default("manual"),
    sourceUrl: text("source_url"),
    capturedAt: text("captured_at").notNull(),
    revision: integer("revision").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_resume_target_briefs_user_updated").on(table.userId, table.updatedAt)],
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
