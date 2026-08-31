CREATE TABLE IF NOT EXISTS `signup_promo_redemptions` (
	`identity_hash` text PRIMARY KEY NOT NULL,
	`granted_user_id` text NOT NULL,
	`campaign` text NOT NULL,
	`created_at` text NOT NULL,
	`retained_until` text NOT NULL,
	CONSTRAINT `chk_signup_promo_identity_hash` CHECK (length(`identity_hash`) = 64)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_signup_promo_retained_until`
ON `signup_promo_redemptions` (`retained_until`);
--> statement-breakpoint
UPDATE `app_schema_meta`
SET `version` = 9, `updated_at` = CURRENT_TIMESTAMP
WHERE `key` = 'app';
