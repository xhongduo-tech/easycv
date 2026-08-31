ALTER TABLE `users` ADD COLUMN `two_factor_enabled` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `auth_sessions` ADD COLUMN `admin_mfa_verified_at` text;
--> statement-breakpoint
CREATE TABLE `auth_two_factors` (
	`id` text PRIMARY KEY NOT NULL,
	`secret` text NOT NULL,
	`backup_codes` text NOT NULL,
	`user_id` text NOT NULL,
	`verified` integer DEFAULT 0 NOT NULL,
	`failed_verification_count` integer DEFAULT 0 NOT NULL,
	`locked_until` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_auth_two_factors_secret` ON `auth_two_factors` (`secret`);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_auth_two_factors_user_id` ON `auth_two_factors` (`user_id`);
--> statement-breakpoint
CREATE TABLE `legal_acceptances` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`terms_version` text NOT NULL,
	`privacy_version` text NOT NULL,
	`acceptance_method` text NOT NULL,
	`accepted_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `chk_legal_acceptance_method` CHECK (`acceptance_method` IN ('consent-page'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_legal_acceptances_user_versions` ON `legal_acceptances` (`user_id`,`terms_version`,`privacy_version`);
--> statement-breakpoint
CREATE INDEX `idx_legal_acceptances_user_accepted` ON `legal_acceptances` (`user_id`,`accepted_at`);
--> statement-breakpoint
UPDATE `app_schema_meta` SET `version` = 8, `updated_at` = CURRENT_TIMESTAMP WHERE `key` = 'app';
