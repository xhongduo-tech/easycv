CREATE TABLE IF NOT EXISTS `model_advice_deliveries` (
	`request_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`resume_id` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`response_json` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	CONSTRAINT `chk_model_advice_delivery_expiry` CHECK (`expires_at` > `created_at`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_model_advice_deliveries_user_created` ON `model_advice_deliveries` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_model_advice_deliveries_expiry` ON `model_advice_deliveries` (`expires_at`);
