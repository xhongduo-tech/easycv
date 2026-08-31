import type { getDatabase } from "@/../db";

type Database = ReturnType<typeof getDatabase>;

export async function buildAccountExport(
  db: Database,
  userId: string,
  generatedAt = new Date().toISOString(),
) {
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
      FROM auth_accounts WHERE user_id = ? ORDER BY created_at`).bind(userId).all(),
    db.prepare(`SELECT id, ip_address, user_agent, created_at, updated_at, expires_at
      FROM auth_sessions WHERE user_id = ? ORDER BY created_at DESC`).bind(userId).all(),
    db.prepare(`SELECT id, title, track, target_profile_id, target_name, template_id, status,
        progress, revision, schema_version, content_json, created_at, updated_at, deleted_at
      FROM resumes WHERE user_id = ? ORDER BY created_at`).bind(userId).all(),
    db.prepare(`SELECT resume_id, kind, focus_name, requirements_text, source_type, source_url,
        captured_at, revision, created_at, updated_at
      FROM resume_target_briefs WHERE user_id = ? ORDER BY created_at`).bind(userId).all(),
    db.prepare(`SELECT id, resume_id, revision, content_json, created_at
      FROM resume_versions WHERE resume_id IN (SELECT id FROM resumes WHERE user_id = ?)
      ORDER BY resume_id, revision`).bind(userId).all(),
    db.prepare(`SELECT id, resume_id, target_profile_id, section, score, provider, created_at
      FROM suggestion_events WHERE resume_id IN (SELECT id FROM resumes WHERE user_id = ?)
      ORDER BY created_at`).bind(userId).all(),
    db.prepare(`SELECT terms_version, privacy_version, acceptance_method, accepted_at
      FROM legal_acceptances WHERE user_id = ? ORDER BY accepted_at`).bind(userId).all(),
    db.prepare(`SELECT resume_id, provider, purpose, consent_version, created_at
      FROM model_consent_events WHERE user_id = ? ORDER BY created_at`).bind(userId).all(),
    db.prepare(`SELECT id, source, reference_id, initial_credits, remaining_credits, expires_at, created_at
      FROM ai_credit_lots WHERE user_id = ? ORDER BY created_at`).bind(userId).all(),
    db.prepare(`SELECT id, request_id, lot_id, credits, status, model, release_reason, created_at, settled_at
      FROM ai_credit_ledger WHERE user_id = ? ORDER BY created_at`).bind(userId).all(),
    db.prepare(`SELECT id, pack_id, credits, amount_fen, currency, status, provider,
        provider_order_id, created_at, paid_at, fulfilled_at
      FROM credit_orders WHERE user_id = ? ORDER BY created_at`).bind(userId).all(),
    db.prepare(`SELECT request_id, model, status, input_tokens, cached_input_tokens, output_tokens,
        price_version, estimated_cost_micros, failure_kind, created_at, settled_at
      FROM model_run_costs WHERE user_id = ? ORDER BY created_at`).bind(userId).all(),
    db.prepare(`SELECT request_id, resume_id, attempt_state, provider_key, started_at,
        terminal_at, failure_kind, created_at, expires_at
      FROM model_advice_deliveries WHERE user_id = ? ORDER BY created_at`).bind(userId).all(),
    db.prepare(`SELECT action, resource_type, resource_id, created_at
      FROM audit_events WHERE actor_id = ? ORDER BY created_at`).bind(userId).all(),
  ]);

  if (!user) throw new Error("Account export user was not found");
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
