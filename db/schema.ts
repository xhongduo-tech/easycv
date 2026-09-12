import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Codex jobs use a separate lifecycle and budget from the synchronous advisor.
export const agentJobs = sqliteTable("agent_jobs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  resumeId: text("resume_id").notNull().references(() => resumes.id, { onDelete: "cascade" }),
  requestId: text("request_id").notNull(),
  status: text("status").notNull(), version: integer("version").notNull().default(1),
  baseResumeRevision: integer("base_resume_revision").notNull(),
  baseBriefRevision: integer("base_brief_revision").notNull(),
  inputJson: text("input_json").notNull(), resultJson: text("result_json"),
  error: text("error"), stage: text("stage").notNull(), model: text("model").notNull(),
  budgetMicros: integer("budget_micros").notNull(),
  maxModelCalls: integer("max_model_calls").notNull(), maxOutputTokens: integer("max_output_tokens").notNull(),
  attempt: integer("attempt").notNull().default(0), leaseToken: text("lease_token"),
  leaseExpiresAt: text("lease_expires_at"), applyToken: text("apply_token"),
  appliedRevision: integer("applied_revision"), appliedProposalIdsJson: text("applied_proposal_ids_json"),
  consentVersion: text("consent_version").notNull(), createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(), expiresAt: text("expires_at").notNull(),
}, (table) => [
  uniqueIndex("idx_agent_jobs_request").on(table.userId, table.requestId),
  index("idx_agent_jobs_owner").on(table.userId, table.resumeId, table.createdAt),
  index("idx_agent_jobs_queue").on(table.status, table.createdAt),
  check("chk_agent_jobs_status", sql`${table.status} IN ('queued','running','waiting_input','ready','applied','failed','cancelled','expired')`),
  check("chk_agent_jobs_version", sql`${table.version} > 0`),
  check("chk_agent_jobs_attempt", sql`${table.attempt} BETWEEN 0 AND 3`),
  check("chk_agent_jobs_budget", sql`${table.budgetMicros} > 0`),
  check("chk_agent_jobs_input", sql`json_valid(${table.inputJson})`),
  check("chk_agent_jobs_resume_revision", sql`${table.baseResumeRevision} > 0`),
  check("chk_agent_jobs_brief_revision", sql`${table.baseBriefRevision} >= 0`),
  check("chk_agent_jobs_result", sql`${table.resultJson} IS NULL OR json_valid(${table.resultJson})`),
  check("chk_agent_jobs_applied_ids", sql`${table.appliedProposalIdsJson} IS NULL OR json_valid(${table.appliedProposalIdsJson})`),
  check("chk_agent_jobs_calls", sql`${table.maxModelCalls} BETWEEN 1 AND 12`),
  check("chk_agent_jobs_output", sql`${table.maxOutputTokens} BETWEEN 512 AND 8000`),
]);

export const agentJobRuns = sqliteTable("agent_job_runs", {
  id: text("id").primaryKey(),
  jobId: text("job_id").notNull().references(() => agentJobs.id, { onDelete: "cascade" }),
  attempt: integer("attempt").notNull(), state: text("state").notNull(),
  inputTokens: integer("input_tokens").notNull().default(0), cachedInputTokens: integer("cached_input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0), modelCalls: integer("model_calls").notNull().default(0),
  costMicros: integer("cost_micros").notNull().default(0), failureCode: text("failure_code"),
  priceVersion: text("price_version"), costBasis: text("cost_basis").notNull().default("unknown"),
  createdAt: text("created_at").notNull(), settledAt: text("settled_at"),
}, (table) => [
  uniqueIndex("idx_agent_job_runs_attempt").on(table.jobId, table.attempt),
  check("chk_agent_job_runs_attempt", sql`${table.attempt} BETWEEN 1 AND 3`),
  check("chk_agent_job_runs_state", sql`${table.state} IN ('running','succeeded','failed','cancelled','unknown')`),
  check("chk_agent_job_runs_input", sql`${table.inputTokens} >= 0`),
  check("chk_agent_job_runs_cache", sql`${table.cachedInputTokens} BETWEEN 0 AND ${table.inputTokens}`),
  check("chk_agent_job_runs_output", sql`${table.outputTokens} >= 0`),
  check("chk_agent_job_runs_calls", sql`${table.modelCalls} BETWEEN 0 AND 12`),
  check("chk_agent_job_runs_cost", sql`${table.costMicros} >= 0`),
  check("chk_agent_job_runs_basis", sql`${table.costBasis} IN ('measured','reserved','unknown')`),
]);

export const agentBudgetLedger = sqliteTable("agent_budget_ledger", {
  jobId: text("job_id").primaryKey(), userId: text("user_id").notNull(),
  reservedMicros: integer("reserved_micros").notNull(), createdAt: text("created_at").notNull(),
}, (table) => [index("idx_agent_budget_day").on(table.createdAt, table.userId),
  check("chk_agent_budget_positive", sql`${table.reservedMicros} > 0`)]);

export const agentRuntimeState = sqliteTable("agent_runtime_state", {
  id: text("id").primaryKey(), lastSeenAt: text("last_seen_at").notNull(),
  workerId: text("worker_id").notNull(), model: text("model").notNull(),
});

export const appSchemaMeta = sqliteTable(
  "app_schema_meta",
  {
    key: text("key").primaryKey(),
    version: integer("version").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [check("chk_app_schema_meta_version", sql`${table.version} > 0`)],
);

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
    twoFactorEnabled: integer("two_factor_enabled", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_users_email").on(table.email),
    uniqueIndex("idx_users_phone_number").on(table.phoneNumber),
  ],
);

export const authTwoFactors = sqliteTable(
  "auth_two_factors",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    verified: integer("verified", { mode: "boolean" }).notNull().default(false),
    failedVerificationCount: integer("failed_verification_count").notNull().default(0),
    lockedUntil: text("locked_until"),
  },
  (table) => [
    index("idx_auth_two_factors_secret").on(table.secret),
    uniqueIndex("idx_auth_two_factors_user_id").on(table.userId),
  ],
);

export const legalAcceptances = sqliteTable(
  "legal_acceptances",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    termsVersion: text("terms_version").notNull(),
    privacyVersion: text("privacy_version").notNull(),
    acceptanceMethod: text("acceptance_method").notNull(),
    acceptedAt: text("accepted_at").notNull(),
  },
  (table) => [
    check("chk_legal_acceptance_method", sql`${table.acceptanceMethod} IN ('consent-page')`),
    uniqueIndex("idx_legal_acceptances_user_versions").on(
      table.userId,
      table.termsVersion,
      table.privacyVersion,
    ),
    index("idx_legal_acceptances_user_accepted").on(table.userId, table.acceptedAt),
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
    adminMfaVerifiedAt: text("admin_mfa_verified_at"),
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
  (table) => [
    index("idx_auth_verifications_identifier").on(table.identifier),
    index("idx_auth_verifications_expires_at").on(table.expiresAt),
  ],
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
  (table) => [
    check("chk_guest_sessions_expiry", sql`${table.expiresAt} > ${table.createdAt}`),
    index("idx_guest_sessions_user").on(table.userId),
    index("idx_guest_sessions_expires_at").on(table.expiresAt),
  ],
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
    check("chk_resumes_track", sql`${table.track} IN ('study','career')`),
    check("chk_resumes_status", sql`${table.status} IN ('draft','ready','archived')`),
    check("chk_resumes_progress", sql`${table.progress} BETWEEN 0 AND 100`),
    check("chk_resumes_revision", sql`${table.revision} >= 1 AND ${table.schemaVersion} = 1`),
    check("chk_resumes_content_json", sql`json_valid(${table.contentJson}) AND length(${table.contentJson}) <= 600000`),
    check("chk_resumes_soft_delete", sql`${table.deletedAt} IS NULL OR ${table.status} = 'archived'`),
    index("idx_resumes_user_updated").on(table.userId, table.updatedAt),
    index("idx_resumes_user_status").on(table.userId, table.status),
    index("idx_resumes_active_user_updated")
      .on(table.userId, table.updatedAt, table.id)
      .where(sql`${table.deletedAt} IS NULL`),
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
  (table) => [
    check("chk_resume_target_briefs_kind", sql`${table.kind} IN ('career-job','study-program')`),
    check(
      "chk_resume_target_briefs_source",
      sql`${table.sourceType} IN ('employer-official','boss','zhaopin','other-platform','manual')`,
    ),
    check("chk_resume_target_briefs_revision", sql`${table.revision} >= 1`),
    index("idx_resume_target_briefs_user_updated").on(table.userId, table.updatedAt),
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
  (table) => [
    check("chk_resume_versions_revision", sql`${table.revision} >= 1`),
    check("chk_resume_versions_content_json", sql`json_valid(${table.contentJson}) AND length(${table.contentJson}) <= 600000`),
    uniqueIndex("idx_resume_versions_revision").on(table.resumeId, table.revision),
  ],
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
  (table) => [
    check(
      "chk_suggestion_events_section",
      sql`${table.section} IN ('overview','basics','summary','experience','education','projects','extras')`,
    ),
    check("chk_suggestion_events_score", sql`${table.score} BETWEEN 0 AND 100`),
    index("idx_suggestion_events_resume").on(table.resumeId, table.createdAt),
  ],
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

export const aiCreditLots = sqliteTable(
  "ai_credit_lots",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    referenceId: text("reference_id").notNull(),
    initialCredits: integer("initial_credits").notNull(),
    remainingCredits: integer("remaining_credits").notNull(),
    expiresAt: text("expires_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    check(
      "chk_ai_credit_lots_amounts",
      sql`${table.initialCredits} >= 0 AND ${table.remainingCredits} >= 0 AND ${table.remainingCredits} <= ${table.initialCredits}`,
    ),
    uniqueIndex("idx_ai_credit_lots_user_source_ref").on(table.userId, table.source, table.referenceId),
    index("idx_ai_credit_lots_user_expiry").on(table.userId, table.expiresAt, table.createdAt),
  ],
);

export const aiCreditLedger = sqliteTable(
  "ai_credit_ledger",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id").notNull(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    lotId: text("lot_id").notNull().references(() => aiCreditLots.id, { onDelete: "cascade" }),
    credits: integer("credits").notNull(),
    status: text("status").notNull(),
    model: text("model").notNull(),
    releaseReason: text("release_reason"),
    createdAt: text("created_at").notNull(),
    settledAt: text("settled_at"),
  },
  (table) => [
    check("chk_ai_credit_ledger_credits", sql`${table.credits} > 0`),
    check("chk_ai_credit_ledger_status", sql`${table.status} IN ('reserved', 'consumed', 'released')`),
    uniqueIndex("idx_ai_credit_ledger_request").on(table.requestId),
    index("idx_ai_credit_ledger_user_created").on(table.userId, table.createdAt),
    index("idx_ai_credit_ledger_status_created").on(table.status, table.createdAt),
  ],
);

export const signupPromoRedemptions = sqliteTable(
  "signup_promo_redemptions",
  {
    identityHash: text("identity_hash").primaryKey(),
    grantedUserId: text("granted_user_id").notNull(),
    campaign: text("campaign").notNull(),
    createdAt: text("created_at").notNull(),
    retainedUntil: text("retained_until").notNull(),
  },
  (table) => [
    check("chk_signup_promo_identity_hash", sql`length(${table.identityHash}) = 64`),
    index("idx_signup_promo_retained_until").on(table.retainedUntil),
  ],
);

export const creditOrders = sqliteTable(
  "credit_orders",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    packId: text("pack_id").notNull(),
    credits: integer("credits").notNull(),
    amountFen: integer("amount_fen").notNull(),
    currency: text("currency").notNull().default("CNY"),
    status: text("status").notNull().default("pending"),
    provider: text("provider"),
    providerOrderId: text("provider_order_id"),
    createdAt: text("created_at").notNull(),
    paidAt: text("paid_at"),
    fulfilledAt: text("fulfilled_at"),
  },
  (table) => [
    check("chk_credit_orders_values", sql`${table.credits} > 0 AND ${table.amountFen} > 0`),
    check("chk_credit_orders_status", sql`${table.status} IN ('pending', 'paid', 'failed', 'refunded', 'cancelled')`),
    index("idx_credit_orders_user_created").on(table.userId, table.createdAt),
    uniqueIndex("idx_credit_orders_provider_order").on(table.provider, table.providerOrderId),
  ],
);

export const modelRunCosts = sqliteTable(
  "model_run_costs",
  {
    requestId: text("request_id").primaryKey(),
    userId: text("user_id").notNull(),
    model: text("model").notNull(),
    status: text("status").notNull(),
    inputTokens: integer("input_tokens"),
    cachedInputTokens: integer("cached_input_tokens"),
    outputTokens: integer("output_tokens"),
    priceVersion: text("price_version").notNull(),
    estimatedCostMicros: integer("estimated_cost_micros"),
    creditLedgerId: text("credit_ledger_id"),
    failureKind: text("failure_kind"),
    createdAt: text("created_at").notNull(),
    settledAt: text("settled_at"),
  },
  (table) => [
    check("chk_model_run_costs_status", sql`${table.status} IN ('running', 'succeeded', 'failed')`),
    check(
      "chk_model_run_costs_tokens",
      sql`(${table.inputTokens} IS NULL OR ${table.inputTokens} >= 0)
        AND (${table.cachedInputTokens} IS NULL OR ${table.cachedInputTokens} >= 0)
        AND (${table.outputTokens} IS NULL OR ${table.outputTokens} >= 0)
        AND (${table.estimatedCostMicros} IS NULL OR ${table.estimatedCostMicros} >= 0)`,
    ),
    check(
      "chk_model_run_costs_cached_tokens",
      sql`${table.cachedInputTokens} IS NULL OR (${table.inputTokens} IS NOT NULL AND ${table.cachedInputTokens} <= ${table.inputTokens})`,
    ),
    index("idx_model_run_costs_user_created").on(table.userId, table.createdAt),
    index("idx_model_run_costs_status_created").on(table.status, table.createdAt),
    index("idx_model_run_costs_created_at").on(table.createdAt),
  ],
);

export const modelAdviceDeliveries = sqliteTable(
  "model_advice_deliveries",
  {
    requestId: text("request_id").primaryKey(),
    userId: text("user_id").notNull(),
    resumeId: text("resume_id").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    responseJson: text("response_json").notNull(),
    attemptState: text("attempt_state").notNull().default("prepared"),
    providerKey: text("provider_key"),
    creditLedgerId: text("credit_ledger_id"),
    providerResponseId: text("provider_response_id"),
    startedAt: text("started_at"),
    updatedAt: text("updated_at").notNull(),
    terminalAt: text("terminal_at"),
    failureKind: text("failure_kind"),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [
    check("chk_model_advice_delivery_expiry", sql`${table.expiresAt} > ${table.createdAt}`),
    check(
      "chk_model_advice_delivery_state",
      sql`${table.attemptState} IN ('prepared','provider_started','settlement_pending','succeeded','fallback','abandoned','expired')`,
    ),
    check("chk_model_advice_delivery_updated", sql`${table.updatedAt} <> ''`),
    index("idx_model_advice_deliveries_user_created").on(table.userId, table.createdAt),
    index("idx_model_advice_deliveries_expiry").on(table.expiresAt),
    index("idx_model_advice_deliveries_state_updated").on(table.attemptState, table.updatedAt),
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

export const modelProviderState = sqliteTable(
  "model_provider_state",
  {
    providerKey: text("provider_key").primaryKey(),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    openUntil: text("open_until"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    check("chk_model_provider_state_failures", sql`${table.consecutiveFailures} >= 0`),
  ],
);

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
  (table) => [
    check("chk_audit_events_metadata_json", sql`json_valid(${table.metadataJson})`),
    index("idx_audit_events_resource").on(table.resourceType, table.resourceId),
  ],
);
