import type { getDatabase } from "@/../db";

type Database = ReturnType<typeof getDatabase>;

export const ACCOUNT_EXPORT_MAX_RECORDS = 20_000;
export const ACCOUNT_EXPORT_MAX_CONTENT_BYTES = 10 * 1024 * 1024;

const ACCOUNT_EXPORT_QUERY_ROW_LIMIT = ACCOUNT_EXPORT_MAX_RECORDS + 1;

export interface AccountExportEstimate {
  recordCount: number;
  contentBytes: number;
}

export class AccountExportTooLargeError extends Error {
  constructor(readonly estimate: AccountExportEstimate) {
    super("Account export exceeds the synchronous export limit");
    this.name = "AccountExportTooLargeError";
  }
}

export function assertAccountExportEstimate(estimate: AccountExportEstimate) {
  if (!Number.isFinite(estimate.recordCount) || !Number.isFinite(estimate.contentBytes)
    || estimate.recordCount < 0 || estimate.contentBytes < 0) {
    throw new TypeError("Account export estimate must contain finite non-negative values");
  }
  if (estimate.recordCount > ACCOUNT_EXPORT_MAX_RECORDS
    || estimate.contentBytes > ACCOUNT_EXPORT_MAX_CONTENT_BYTES) {
    throw new AccountExportTooLargeError(estimate);
  }
}

export async function buildAccountExport(
  db: Database,
  userId: string,
  generatedAt = new Date().toISOString(),
) {
  assertAccountExportEstimate(await estimateAccountExport(db, userId));

  const [
    user,
    accounts,
    sessions,
    resumes,
    briefs,
    versions,
    suggestions,
    legal,
    modelConsents,
    creditLots,
    creditLedger,
    creditOrders,
    modelRuns,
    adviceDeliveries,
    audit,
  ] = await Promise.all([
    db.prepare(`SELECT id, name, email, email_verified, image, role, banned,
        phone_number, phone_number_verified, two_factor_enabled, created_at, updated_at
      FROM users WHERE id = ?`).bind(userId).first(),
    db.prepare(`SELECT id, issuer, account_id, provider_id, scope, created_at, updated_at
      FROM auth_accounts WHERE user_id = ? ORDER BY created_at
      LIMIT ${ACCOUNT_EXPORT_QUERY_ROW_LIMIT}`).bind(userId).all<Record<string, unknown>>(),
    db.prepare(`SELECT id, ip_address, user_agent, created_at, updated_at, expires_at
      FROM auth_sessions WHERE user_id = ? ORDER BY created_at DESC
      LIMIT ${ACCOUNT_EXPORT_QUERY_ROW_LIMIT}`).bind(userId).all<Record<string, unknown>>(),
    db.prepare(`SELECT id, title, track, target_profile_id, target_name, template_id, status,
        progress, revision, schema_version, content_json, created_at, updated_at, deleted_at
      FROM resumes WHERE user_id = ? ORDER BY created_at
      LIMIT ${ACCOUNT_EXPORT_QUERY_ROW_LIMIT}`).bind(userId).all<Record<string, unknown>>(),
    db.prepare(`SELECT resume_id, kind, focus_name, requirements_text, source_type, source_url,
        captured_at, revision, created_at, updated_at
      FROM resume_target_briefs WHERE user_id = ? ORDER BY created_at
      LIMIT ${ACCOUNT_EXPORT_QUERY_ROW_LIMIT}`).bind(userId).all<Record<string, unknown>>(),
    db.prepare(`SELECT id, resume_id, revision, content_json, created_at
      FROM resume_versions WHERE resume_id IN (SELECT id FROM resumes WHERE user_id = ?)
      ORDER BY resume_id, revision
      LIMIT ${ACCOUNT_EXPORT_QUERY_ROW_LIMIT}`).bind(userId).all<Record<string, unknown>>(),
    db.prepare(`SELECT id, resume_id, target_profile_id, section, score, provider, created_at
      FROM suggestion_events WHERE resume_id IN (SELECT id FROM resumes WHERE user_id = ?)
      ORDER BY created_at
      LIMIT ${ACCOUNT_EXPORT_QUERY_ROW_LIMIT}`).bind(userId).all<Record<string, unknown>>(),
    db.prepare(`SELECT terms_version, privacy_version, acceptance_method, accepted_at
      FROM legal_acceptances WHERE user_id = ? ORDER BY accepted_at
      LIMIT ${ACCOUNT_EXPORT_QUERY_ROW_LIMIT}`).bind(userId).all<Record<string, unknown>>(),
    db.prepare(`SELECT resume_id, provider, purpose, consent_version, created_at
      FROM model_consent_events WHERE user_id = ? ORDER BY created_at
      LIMIT ${ACCOUNT_EXPORT_QUERY_ROW_LIMIT}`).bind(userId).all<Record<string, unknown>>(),
    db.prepare(`SELECT id, source, reference_id, initial_credits, remaining_credits, expires_at, created_at
      FROM ai_credit_lots WHERE user_id = ? ORDER BY created_at
      LIMIT ${ACCOUNT_EXPORT_QUERY_ROW_LIMIT}`).bind(userId).all<Record<string, unknown>>(),
    db.prepare(`SELECT id, request_id, lot_id, credits, status, model, release_reason, created_at, settled_at
      FROM ai_credit_ledger WHERE user_id = ? ORDER BY created_at
      LIMIT ${ACCOUNT_EXPORT_QUERY_ROW_LIMIT}`).bind(userId).all<Record<string, unknown>>(),
    db.prepare(`SELECT id, pack_id, credits, amount_fen, currency, status, provider,
        provider_order_id, created_at, paid_at, fulfilled_at
      FROM credit_orders WHERE user_id = ? ORDER BY created_at
      LIMIT ${ACCOUNT_EXPORT_QUERY_ROW_LIMIT}`).bind(userId).all<Record<string, unknown>>(),
    db.prepare(`SELECT request_id, model, status, input_tokens, cached_input_tokens, output_tokens,
        price_version, estimated_cost_micros, failure_kind, created_at, settled_at
      FROM model_run_costs WHERE user_id = ? ORDER BY created_at
      LIMIT ${ACCOUNT_EXPORT_QUERY_ROW_LIMIT}`).bind(userId).all<Record<string, unknown>>(),
    db.prepare(`SELECT request_id, resume_id, attempt_state, provider_key, started_at,
        terminal_at, failure_kind, created_at, expires_at
      FROM model_advice_deliveries WHERE user_id = ? ORDER BY created_at
      LIMIT ${ACCOUNT_EXPORT_QUERY_ROW_LIMIT}`).bind(userId).all<Record<string, unknown>>(),
    db.prepare(`SELECT action, resource_type, resource_id, created_at
      FROM audit_events WHERE actor_id = ? ORDER BY created_at
      LIMIT ${ACCOUNT_EXPORT_QUERY_ROW_LIMIT}`).bind(userId).all<Record<string, unknown>>(),
  ]);

  if (!user) throw new Error("Account export user was not found");
  assertAccountExportEstimate({
    recordCount: 1 + [
      accounts,
      sessions,
      resumes,
      briefs,
      versions,
      suggestions,
      legal,
      modelConsents,
      creditLots,
      creditLedger,
      creditOrders,
      modelRuns,
      adviceDeliveries,
      audit,
    ].reduce<number>((total, result) => total + exportRows(result).length, 0),
    contentBytes: sumUtf8Bytes(exportRows(resumes), "content_json")
      + sumUtf8Bytes(exportRows(versions), "content_json")
      + sumUtf8Bytes(exportRows(briefs), "requirements_text"),
  });
  return {
    schemaVersion: 1,
    generatedAt,
    user,
    identity: { accounts: accounts.results, sessions: sessions.results },
    resumes: {
      records: resumes.results,
      targetBriefs: briefs.results,
      versions: versions.results,
      suggestionEvents: suggestions.results,
    },
    legal: { acceptances: legal.results, modelConsents: modelConsents.results },
    aiCredits: {
      lots: creditLots.results,
      ledger: creditLedger.results,
      orders: creditOrders.results,
      modelRuns: modelRuns.results,
      requestHistory: adviceDeliveries.results,
    },
    auditEvents: audit.results,
  };
}

async function estimateAccountExport(db: Database, userId: string): Promise<AccountExportEstimate> {
  const row = await db.prepare(`WITH export_owner AS (SELECT ? AS user_id),
    export_estimate(record_count, content_bytes) AS (
      SELECT COUNT(*), 0 FROM users WHERE id = (SELECT user_id FROM export_owner)
      UNION ALL
      SELECT COUNT(*), 0 FROM auth_accounts WHERE user_id = (SELECT user_id FROM export_owner)
      UNION ALL
      SELECT COUNT(*), 0 FROM auth_sessions WHERE user_id = (SELECT user_id FROM export_owner)
      UNION ALL
      SELECT COUNT(*), COALESCE(SUM(length(CAST(content_json AS BLOB))), 0)
        FROM resumes WHERE user_id = (SELECT user_id FROM export_owner)
      UNION ALL
      SELECT COUNT(*), COALESCE(SUM(length(CAST(requirements_text AS BLOB))), 0)
        FROM resume_target_briefs WHERE user_id = (SELECT user_id FROM export_owner)
      UNION ALL
      SELECT COUNT(*), COALESCE(SUM(length(CAST(content_json AS BLOB))), 0)
        FROM resume_versions
        WHERE resume_id IN (SELECT id FROM resumes WHERE user_id = (SELECT user_id FROM export_owner))
      UNION ALL
      SELECT COUNT(*), 0 FROM suggestion_events
        WHERE resume_id IN (SELECT id FROM resumes WHERE user_id = (SELECT user_id FROM export_owner))
      UNION ALL
      SELECT COUNT(*), 0 FROM legal_acceptances WHERE user_id = (SELECT user_id FROM export_owner)
      UNION ALL
      SELECT COUNT(*), 0 FROM model_consent_events WHERE user_id = (SELECT user_id FROM export_owner)
      UNION ALL
      SELECT COUNT(*), 0 FROM ai_credit_lots WHERE user_id = (SELECT user_id FROM export_owner)
      UNION ALL
      SELECT COUNT(*), 0 FROM ai_credit_ledger WHERE user_id = (SELECT user_id FROM export_owner)
      UNION ALL
      SELECT COUNT(*), 0 FROM credit_orders WHERE user_id = (SELECT user_id FROM export_owner)
      UNION ALL
      SELECT COUNT(*), 0 FROM model_run_costs WHERE user_id = (SELECT user_id FROM export_owner)
      UNION ALL
      SELECT COUNT(*), 0 FROM model_advice_deliveries WHERE user_id = (SELECT user_id FROM export_owner)
      UNION ALL
      SELECT COUNT(*), 0 FROM audit_events WHERE actor_id = (SELECT user_id FROM export_owner)
    )
    SELECT COALESCE(SUM(record_count), 0) AS record_count,
      COALESCE(SUM(content_bytes), 0) AS content_bytes
    FROM export_estimate`).bind(userId).first<{
      record_count: number | string;
      content_bytes: number | string;
    }>();

  return {
    recordCount: Number(row?.record_count ?? 0),
    contentBytes: Number(row?.content_bytes ?? 0),
  };
}

function sumUtf8Bytes(rows: unknown[], field: string) {
  return rows.reduce<number>((total, row) => {
    if (!row || typeof row !== "object") return total;
    const value = (row as Record<string, unknown>)[field];
    return total + (typeof value === "string" ? new TextEncoder().encode(value).byteLength : 0);
  }, 0);
}

function exportRows(result: { results: unknown }) {
  return Array.isArray(result.results) ? result.results : [];
}
