CREATE TABLE IF NOT EXISTS `guest_session_usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`network_hash` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_guest_session_usage_network_created` ON `guest_session_usage_events` (`network_hash`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_guest_session_usage_created` ON `guest_session_usage_events` (`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `advice_usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`network_hash` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_advice_usage_user_created` ON `advice_usage_events` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_advice_usage_network_created` ON `advice_usage_events` (`network_hash`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_advice_usage_created` ON `advice_usage_events` (`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `model_usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`network_hash` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_model_usage_user_created` ON `model_usage_events` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_model_usage_network_created` ON `model_usage_events` (`network_hash`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_model_usage_created` ON `model_usage_events` (`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `model_request_leases` (
	`slot` integer PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `model_session_leases` (
	`owner_key` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `model_consent_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`resume_id` text NOT NULL,
	`provider` text NOT NULL,
	`purpose` text NOT NULL,
	`consent_version` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_model_consent_resume_created` ON `model_consent_events` (`resume_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `model_provider_state` (
	`provider_key` text PRIMARY KEY NOT NULL,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`open_until` text,
	`updated_at` text NOT NULL
);
