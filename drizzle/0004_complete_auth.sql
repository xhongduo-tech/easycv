ALTER TABLE `users` ADD COLUMN `email_verified` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `image` text;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `updated_at` text;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `banned` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `ban_reason` text;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `ban_expires` text;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `phone_number` text;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `phone_number_verified` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE `users` SET `updated_at` = `created_at` WHERE `updated_at` IS NULL OR `updated_at` = '';
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_phone_number` ON `users` (`phone_number`);
--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` text NOT NULL,
	`token` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	`impersonated_by` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_auth_sessions_token` ON `auth_sessions` (`token`);
--> statement-breakpoint
CREATE INDEX `idx_auth_sessions_user_id` ON `auth_sessions` (`user_id`);
--> statement-breakpoint
CREATE TABLE `auth_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`issuer` text NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` text,
	`refresh_token_expires_at` text,
	`scope` text,
	`password` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_auth_accounts_issuer_account` ON `auth_accounts` (`issuer`,`account_id`);
--> statement-breakpoint
CREATE INDEX `idx_auth_accounts_user_id` ON `auth_accounts` (`user_id`);
--> statement-breakpoint
CREATE TABLE `auth_verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_auth_verifications_identifier` ON `auth_verifications` (`identifier`);
--> statement-breakpoint
CREATE TABLE `auth_rate_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`count` integer NOT NULL,
	`last_request` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_auth_rate_limits_key` ON `auth_rate_limits` (`key`);
