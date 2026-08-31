CREATE TABLE IF NOT EXISTS `ai_credit_lots` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source` text NOT NULL,
	`reference_id` text NOT NULL,
	`initial_credits` integer NOT NULL,
	`remaining_credits` integer NOT NULL,
	`expires_at` text,
	`created_at` text NOT NULL,
	CONSTRAINT `chk_ai_credit_lots_amounts` CHECK (`initial_credits` >= 0 AND `remaining_credits` >= 0 AND `remaining_credits` <= `initial_credits`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_ai_credit_lots_user_source_ref` ON `ai_credit_lots` (`user_id`,`source`,`reference_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ai_credit_lots_user_expiry` ON `ai_credit_lots` (`user_id`,`expires_at`,`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ai_credit_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`user_id` text NOT NULL,
	`lot_id` text NOT NULL,
	`credits` integer NOT NULL,
	`status` text NOT NULL,
	`model` text NOT NULL,
	`release_reason` text,
	`created_at` text NOT NULL,
	`settled_at` text,
	CONSTRAINT `chk_ai_credit_ledger_credits` CHECK (`credits` > 0),
	CONSTRAINT `chk_ai_credit_ledger_status` CHECK (`status` IN ('reserved', 'consumed', 'released')),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lot_id`) REFERENCES `ai_credit_lots`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_ai_credit_ledger_request` ON `ai_credit_ledger` (`request_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ai_credit_ledger_user_created` ON `ai_credit_ledger` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ai_credit_ledger_status_created` ON `ai_credit_ledger` (`status`,`created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `credit_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`pack_id` text NOT NULL,
	`credits` integer NOT NULL,
	`amount_fen` integer NOT NULL,
	`currency` text DEFAULT 'CNY' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`provider` text,
	`provider_order_id` text,
	`created_at` text NOT NULL,
	`paid_at` text,
	`fulfilled_at` text,
	CONSTRAINT `chk_credit_orders_values` CHECK (`credits` > 0 AND `amount_fen` > 0),
	CONSTRAINT `chk_credit_orders_status` CHECK (`status` IN ('pending', 'paid', 'failed', 'refunded', 'cancelled'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_credit_orders_user_created` ON `credit_orders` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_credit_orders_provider_order` ON `credit_orders` (`provider`,`provider_order_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `model_run_costs` (
	`request_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`model` text NOT NULL,
	`status` text NOT NULL,
	`input_tokens` integer,
	`cached_input_tokens` integer,
	`output_tokens` integer,
	`price_version` text NOT NULL,
	`estimated_cost_micros` integer,
	`credit_ledger_id` text,
	`failure_kind` text,
	`created_at` text NOT NULL,
	`settled_at` text,
	CONSTRAINT `chk_model_run_costs_status` CHECK (`status` IN ('running', 'succeeded', 'failed')),
	CONSTRAINT `chk_model_run_costs_tokens` CHECK (
		(`input_tokens` IS NULL OR `input_tokens` >= 0)
		AND (`cached_input_tokens` IS NULL OR `cached_input_tokens` >= 0)
		AND (`output_tokens` IS NULL OR `output_tokens` >= 0)
		AND (`estimated_cost_micros` IS NULL OR `estimated_cost_micros` >= 0)
	)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_model_run_costs_user_created` ON `model_run_costs` (`user_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_model_run_costs_status_created` ON `model_run_costs` (`status`,`created_at`);
--> statement-breakpoint
PRAGMA optimize;
