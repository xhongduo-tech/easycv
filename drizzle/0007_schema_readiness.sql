CREATE TABLE IF NOT EXISTS `app_schema_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `chk_app_schema_meta_version` CHECK (`version` > 0)
);
--> statement-breakpoint
INSERT INTO `app_schema_meta` (`key`, `version`, `updated_at`)
VALUES ('app', 7, CURRENT_TIMESTAMP)
ON CONFLICT(`key`) DO UPDATE SET `version` = excluded.`version`, `updated_at` = excluded.`updated_at`;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_guest_sessions_expires_at` ON `guest_sessions` (`expires_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_auth_verifications_expires_at` ON `auth_verifications` (`expires_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_model_run_costs_created_at` ON `model_run_costs` (`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_resumes_active_user_updated`
ON `resumes` (`user_id`, `updated_at`, `id`) WHERE `deleted_at` IS NULL;
--> statement-breakpoint
PRAGMA optimize;
