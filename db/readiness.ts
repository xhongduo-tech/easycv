export const REQUIRED_DATABASE_TABLES = [
  "app_schema_meta",
  "users",
  "auth_sessions",
  "auth_accounts",
  "auth_verifications",
  "auth_rate_limits",
  "auth_two_factors",
  "legal_acceptances",
  "guest_sessions",
  "catalog_meta",
  "templates",
  "target_profiles",
  "resumes",
  "resume_target_briefs",
  "resume_versions",
  "suggestion_events",
  "guest_session_usage_events",
  "advice_usage_events",
  "model_usage_events",
  "ai_credit_lots",
  "ai_credit_ledger",
  "signup_promo_redemptions",
  "credit_orders",
  "model_run_costs",
  "model_advice_deliveries",
  "model_request_leases",
  "model_session_leases",
  "model_consent_events",
  "model_provider_state",
  "audit_events",
  "agent_jobs",
  "agent_job_runs",
  "agent_budget_ledger",
  "agent_runtime_state",
] as const;

export const CURRENT_SCHEMA_VERSION = 14;

const requiredTableList = REQUIRED_DATABASE_TABLES.map((name) => `'${name}'`).join(", ");

/**
 * This is deliberately one read-only query. Schema creation belongs to the
 * deployment migration phase, outside the request path.
 */
export const DATABASE_READINESS_SQL = `SELECT COUNT(*) AS present_count
  FROM sqlite_schema
  WHERE type = 'table' AND name IN (${requiredTableList})`;

export const DATABASE_SCHEMA_VERSION_SQL = `SELECT version
  FROM app_schema_meta WHERE key = 'app'`;

/** One request-time read verifies both the table manifest and schema version. */
export const DATABASE_STATE_SQL = `SELECT
    COUNT(*) AS present_count,
    (SELECT version FROM app_schema_meta WHERE key = 'app') AS version
  FROM sqlite_schema
  WHERE type = 'table' AND name IN (${requiredTableList})`;

export function isDatabaseSchemaReady(presentCount: unknown, schemaVersion: unknown) {
  return Number(presentCount) === REQUIRED_DATABASE_TABLES.length
    && Number(schemaVersion) === CURRENT_SCHEMA_VERSION;
}

export function maximumInitializationQueryCount(templateCount: number, targetProfileCount: number) {
  // Combined readiness/version, catalog version, up to two JSON-backed bulk
  // upserts, and one catalog-version write.
  return 3 + Number(templateCount > 0) + Number(targetProfileCount > 0);
}
