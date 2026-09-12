-- Persist pricing provenance and distinguish measured usage from reserved cost.
ALTER TABLE agent_job_runs ADD COLUMN price_version TEXT;
--> statement-breakpoint
ALTER TABLE agent_job_runs ADD COLUMN cost_basis TEXT NOT NULL DEFAULT 'unknown'
  CHECK(cost_basis IN ('measured','reserved','unknown'));
--> statement-breakpoint
UPDATE app_schema_meta SET version=14,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key='app';
