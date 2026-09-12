-- The job row is the durable queue. Atomic conditional writes fence claim,
-- cancellation, completion and application; no external dispatch can be lost.
CREATE TABLE agent_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resume_id TEXT NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('queued','running','waiting_input','ready','applied','failed','cancelled','expired')),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
  base_resume_revision INTEGER NOT NULL CHECK(base_resume_revision > 0),
  base_brief_revision INTEGER NOT NULL CHECK(base_brief_revision >= 0),
  input_json TEXT NOT NULL CHECK(json_valid(input_json)),
  result_json TEXT CHECK(result_json IS NULL OR json_valid(result_json)),
  error TEXT,
  stage TEXT NOT NULL,
  model TEXT NOT NULL,
  budget_micros INTEGER NOT NULL CHECK(budget_micros > 0),
  max_model_calls INTEGER NOT NULL CHECK(max_model_calls BETWEEN 1 AND 12),
  max_output_tokens INTEGER NOT NULL CHECK(max_output_tokens BETWEEN 512 AND 8000),
  attempt INTEGER NOT NULL DEFAULT 0 CHECK(attempt BETWEEN 0 AND 3),
  lease_token TEXT,
  lease_expires_at TEXT,
  apply_token TEXT,
  applied_revision INTEGER,
  applied_proposal_ids_json TEXT CHECK(applied_proposal_ids_json IS NULL OR json_valid(applied_proposal_ids_json)),
  consent_version TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_agent_jobs_request ON agent_jobs(user_id,request_id);
--> statement-breakpoint
CREATE INDEX idx_agent_jobs_owner ON agent_jobs(user_id,resume_id,created_at);
--> statement-breakpoint
CREATE INDEX idx_agent_jobs_queue ON agent_jobs(status,created_at);
--> statement-breakpoint
CREATE TABLE agent_job_runs (
  id TEXT PRIMARY KEY NOT NULL,
  job_id TEXT NOT NULL REFERENCES agent_jobs(id) ON DELETE CASCADE,
  attempt INTEGER NOT NULL CHECK(attempt BETWEEN 1 AND 3),
  state TEXT NOT NULL CHECK(state IN ('running','succeeded','failed','cancelled','unknown')),
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK(input_tokens >= 0),
  cached_input_tokens INTEGER NOT NULL DEFAULT 0 CHECK(cached_input_tokens BETWEEN 0 AND input_tokens),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK(output_tokens >= 0),
  model_calls INTEGER NOT NULL DEFAULT 0 CHECK(model_calls BETWEEN 0 AND 12),
  cost_micros INTEGER NOT NULL DEFAULT 0 CHECK(cost_micros >= 0),
  failure_code TEXT,
  created_at TEXT NOT NULL,
  settled_at TEXT
);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_agent_job_runs_attempt ON agent_job_runs(job_id,attempt);
--> statement-breakpoint
-- Deliberately no user/job FK: deleting content must not reset platform spend.
CREATE TABLE agent_budget_ledger (
  job_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  reserved_micros INTEGER NOT NULL CHECK(reserved_micros > 0),
  created_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX idx_agent_budget_day ON agent_budget_ledger(created_at,user_id);
--> statement-breakpoint
CREATE TABLE agent_runtime_state (
  id TEXT PRIMARY KEY NOT NULL,
  last_seen_at TEXT NOT NULL,
  worker_id TEXT NOT NULL,
  model TEXT NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER trg_agent_job_budget AFTER INSERT ON agent_jobs BEGIN
  INSERT INTO agent_budget_ledger(job_id,user_id,reserved_micros,created_at)
    VALUES(NEW.id,NEW.user_id,NEW.budget_micros,NEW.created_at);
END;
--> statement-breakpoint
CREATE TRIGGER trg_agent_job_claim AFTER UPDATE OF attempt ON agent_jobs
WHEN NEW.status='running' AND NEW.attempt=OLD.attempt+1 BEGIN
  INSERT INTO agent_job_runs(id,job_id,attempt,state,created_at)
    VALUES(NEW.lease_token,NEW.id,NEW.attempt,'running',NEW.updated_at);
END;
--> statement-breakpoint
CREATE TRIGGER trg_agent_job_resume_deleted AFTER UPDATE OF deleted_at ON resumes
WHEN NEW.deleted_at IS NOT NULL BEGIN
  UPDATE agent_jobs SET status='cancelled',version=version+1,stage='已取消',
    result_json=NULL,error='简历已归档',updated_at=NEW.updated_at
    WHERE resume_id=NEW.id AND status IN ('queued','running','waiting_input','ready');
END;
--> statement-breakpoint
UPDATE app_schema_meta SET version=13,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE key='app';
