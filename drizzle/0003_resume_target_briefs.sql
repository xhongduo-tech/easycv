CREATE TABLE IF NOT EXISTS `resume_target_briefs` (
	`resume_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`focus_name` text NOT NULL,
	`requirements_text` text DEFAULT '' NOT NULL,
	`source_type` text DEFAULT 'manual' NOT NULL,
	`source_url` text,
	`captured_at` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`resume_id`) REFERENCES `resumes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_resume_target_briefs_user_updated` ON `resume_target_briefs` (`user_id`,`updated_at`);
