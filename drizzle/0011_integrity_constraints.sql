CREATE TRIGGER `trg_resumes_integrity_insert`
BEFORE INSERT ON `resumes`
WHEN NEW.`track` NOT IN ('study','career')
  OR NEW.`status` NOT IN ('draft','ready','archived')
  OR typeof(NEW.`progress`) <> 'integer' OR NEW.`progress` < 0 OR NEW.`progress` > 100
  OR typeof(NEW.`revision`) <> 'integer' OR NEW.`revision` < 1
  OR NEW.`schema_version` <> 1
  OR length(trim(NEW.`title`)) < 1 OR length(NEW.`title`) > 160
  OR length(trim(NEW.`target_name`)) < 1 OR length(NEW.`target_name`) > 240
  OR json_valid(NEW.`content_json`) = 0 OR length(NEW.`content_json`) > 600000
  OR (NEW.`deleted_at` IS NOT NULL AND NEW.`status` <> 'archived')
BEGIN
  SELECT RAISE(ABORT, 'resumes integrity constraint');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_resumes_integrity_update`
BEFORE UPDATE ON `resumes`
WHEN NEW.`track` NOT IN ('study','career')
  OR NEW.`status` NOT IN ('draft','ready','archived')
  OR typeof(NEW.`progress`) <> 'integer' OR NEW.`progress` < 0 OR NEW.`progress` > 100
  OR typeof(NEW.`revision`) <> 'integer' OR NEW.`revision` < 1
  OR NEW.`schema_version` <> 1
  OR length(trim(NEW.`title`)) < 1 OR length(NEW.`title`) > 160
  OR length(trim(NEW.`target_name`)) < 1 OR length(NEW.`target_name`) > 240
  OR json_valid(NEW.`content_json`) = 0 OR length(NEW.`content_json`) > 600000
  OR (NEW.`deleted_at` IS NOT NULL AND NEW.`status` <> 'archived')
BEGIN
  SELECT RAISE(ABORT, 'resumes integrity constraint');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_resume_target_briefs_integrity_insert`
BEFORE INSERT ON `resume_target_briefs`
WHEN NEW.`kind` NOT IN ('career-job','study-program')
  OR NEW.`source_type` NOT IN ('employer-official','boss','zhaopin','other-platform','manual')
  OR typeof(NEW.`revision`) <> 'integer' OR NEW.`revision` < 1
  OR length(trim(NEW.`focus_name`)) < 1 OR length(NEW.`focus_name`) > 160
  OR length(NEW.`requirements_text`) > 12000
  OR (NEW.`source_url` IS NOT NULL AND NEW.`source_url` <> ''
    AND NEW.`source_url` NOT LIKE 'http://%' AND NEW.`source_url` NOT LIKE 'https://%')
BEGIN
  SELECT RAISE(ABORT, 'resume target brief integrity constraint');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_resume_target_briefs_integrity_update`
BEFORE UPDATE ON `resume_target_briefs`
WHEN NEW.`kind` NOT IN ('career-job','study-program')
  OR NEW.`source_type` NOT IN ('employer-official','boss','zhaopin','other-platform','manual')
  OR typeof(NEW.`revision`) <> 'integer' OR NEW.`revision` < 1
  OR length(trim(NEW.`focus_name`)) < 1 OR length(NEW.`focus_name`) > 160
  OR length(NEW.`requirements_text`) > 12000
  OR (NEW.`source_url` IS NOT NULL AND NEW.`source_url` <> ''
    AND NEW.`source_url` NOT LIKE 'http://%' AND NEW.`source_url` NOT LIKE 'https://%')
BEGIN
  SELECT RAISE(ABORT, 'resume target brief integrity constraint');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_resume_versions_integrity_insert`
BEFORE INSERT ON `resume_versions`
WHEN typeof(NEW.`revision`) <> 'integer' OR NEW.`revision` < 1
  OR json_valid(NEW.`content_json`) = 0 OR length(NEW.`content_json`) > 600000
BEGIN
  SELECT RAISE(ABORT, 'resume version integrity constraint');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_resume_versions_integrity_update`
BEFORE UPDATE ON `resume_versions`
WHEN typeof(NEW.`revision`) <> 'integer' OR NEW.`revision` < 1
  OR json_valid(NEW.`content_json`) = 0 OR length(NEW.`content_json`) > 600000
BEGIN
  SELECT RAISE(ABORT, 'resume version integrity constraint');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_suggestion_events_integrity_insert`
BEFORE INSERT ON `suggestion_events`
WHEN NEW.`section` NOT IN ('overview','basics','summary','experience','education','projects','extras')
  OR typeof(NEW.`score`) <> 'integer' OR NEW.`score` < 0 OR NEW.`score` > 100
BEGIN
  SELECT RAISE(ABORT, 'suggestion event integrity constraint');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_suggestion_events_integrity_update`
BEFORE UPDATE ON `suggestion_events`
WHEN NEW.`section` NOT IN ('overview','basics','summary','experience','education','projects','extras')
  OR typeof(NEW.`score`) <> 'integer' OR NEW.`score` < 0 OR NEW.`score` > 100
BEGIN
  SELECT RAISE(ABORT, 'suggestion event integrity constraint');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_guest_sessions_integrity_insert`
BEFORE INSERT ON `guest_sessions`
WHEN NEW.`expires_at` <= NEW.`created_at`
BEGIN
  SELECT RAISE(ABORT, 'guest session expiry constraint');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_guest_sessions_integrity_update`
BEFORE UPDATE ON `guest_sessions`
WHEN NEW.`expires_at` <= NEW.`created_at`
BEGIN
  SELECT RAISE(ABORT, 'guest session expiry constraint');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_audit_events_integrity_insert`
BEFORE INSERT ON `audit_events`
WHEN json_valid(NEW.`metadata_json`) = 0
  OR CASE WHEN json_valid(NEW.`metadata_json`) = 1
    THEN json_type(NEW.`metadata_json`) <> 'object' ELSE 1 END
BEGIN
  SELECT RAISE(ABORT, 'audit metadata integrity constraint');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_audit_events_integrity_update`
BEFORE UPDATE ON `audit_events`
WHEN json_valid(NEW.`metadata_json`) = 0
  OR CASE WHEN json_valid(NEW.`metadata_json`) = 1
    THEN json_type(NEW.`metadata_json`) <> 'object' ELSE 1 END
BEGIN
  SELECT RAISE(ABORT, 'audit metadata integrity constraint');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_model_run_costs_integrity_insert`
BEFORE INSERT ON `model_run_costs`
WHEN (NEW.`cached_input_tokens` IS NOT NULL AND
    (NEW.`input_tokens` IS NULL OR NEW.`cached_input_tokens` > NEW.`input_tokens`))
  OR (NEW.`status` = 'succeeded' AND
    (NEW.`input_tokens` IS NULL OR NEW.`input_tokens` <= 0
      OR NEW.`output_tokens` IS NULL OR NEW.`output_tokens` <= 0
      OR NEW.`estimated_cost_micros` IS NULL))
BEGIN
  SELECT RAISE(ABORT, 'model run cost integrity constraint');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_model_run_costs_integrity_update`
BEFORE UPDATE ON `model_run_costs`
WHEN (NEW.`cached_input_tokens` IS NOT NULL AND
    (NEW.`input_tokens` IS NULL OR NEW.`cached_input_tokens` > NEW.`input_tokens`))
  OR (NEW.`status` = 'succeeded' AND
    (NEW.`input_tokens` IS NULL OR NEW.`input_tokens` <= 0
      OR NEW.`output_tokens` IS NULL OR NEW.`output_tokens` <= 0
      OR NEW.`estimated_cost_micros` IS NULL))
BEGIN
  SELECT RAISE(ABORT, 'model run cost integrity constraint');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_model_advice_deliveries_integrity_insert`
BEFORE INSERT ON `model_advice_deliveries`
WHEN NEW.`updated_at` = ''
  OR (NEW.`attempt_state` IN ('prepared','provider_started','settlement_pending')
    AND (NEW.`response_json` <> '__pending__' OR NEW.`terminal_at` IS NOT NULL))
  OR (NEW.`attempt_state` IN ('provider_started','settlement_pending') AND NEW.`started_at` IS NULL)
  OR (NEW.`attempt_state` IN ('succeeded','fallback') AND
    (NEW.`terminal_at` IS NULL OR NEW.`response_json` IN ('{}','__pending__')
      OR CASE WHEN json_valid(NEW.`response_json`) = 1
        THEN json_type(NEW.`response_json`) <> 'object' ELSE 1 END))
  OR (NEW.`attempt_state` = 'abandoned' AND
    (NEW.`terminal_at` IS NULL OR NEW.`response_json` NOT IN ('{}','__pending__')))
  OR (NEW.`attempt_state` = 'expired' AND
    (NEW.`terminal_at` IS NULL OR NEW.`response_json` <> '{}'))
BEGIN
  SELECT RAISE(ABORT, 'model advice delivery lifecycle constraint');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_model_advice_deliveries_integrity_update`
BEFORE UPDATE ON `model_advice_deliveries`
WHEN NEW.`updated_at` = ''
  OR (NEW.`attempt_state` IN ('prepared','provider_started','settlement_pending')
    AND (NEW.`response_json` <> '__pending__' OR NEW.`terminal_at` IS NOT NULL))
  OR (NEW.`attempt_state` IN ('provider_started','settlement_pending') AND NEW.`started_at` IS NULL)
  OR (NEW.`attempt_state` IN ('succeeded','fallback') AND
    (NEW.`terminal_at` IS NULL OR NEW.`response_json` IN ('{}','__pending__')
      OR CASE WHEN json_valid(NEW.`response_json`) = 1
        THEN json_type(NEW.`response_json`) <> 'object' ELSE 1 END))
  OR (NEW.`attempt_state` = 'abandoned' AND
    (NEW.`terminal_at` IS NULL OR NEW.`response_json` NOT IN ('{}','__pending__')))
  OR (NEW.`attempt_state` = 'expired' AND
    (NEW.`terminal_at` IS NULL OR NEW.`response_json` <> '{}'))
BEGIN
  SELECT RAISE(ABORT, 'model advice delivery lifecycle constraint');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_model_provider_state_integrity_insert`
BEFORE INSERT ON `model_provider_state`
WHEN typeof(NEW.`consecutive_failures`) <> 'integer' OR NEW.`consecutive_failures` < 0
BEGIN
  SELECT RAISE(ABORT, 'model provider state integrity constraint');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_model_provider_state_integrity_update`
BEFORE UPDATE ON `model_provider_state`
WHEN typeof(NEW.`consecutive_failures`) <> 'integer' OR NEW.`consecutive_failures` < 0
BEGIN
  SELECT RAISE(ABORT, 'model provider state integrity constraint');
END;
--> statement-breakpoint
UPDATE `app_schema_meta` SET `version` = 11, `updated_at` = CURRENT_TIMESTAMP WHERE `key` = 'app';
