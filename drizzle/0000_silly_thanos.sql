CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_events_resource` ON `audit_events` (`resource_type`,`resource_id`);--> statement-breakpoint
CREATE TABLE `resume_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`resume_id` text NOT NULL,
	`revision` integer NOT NULL,
	`content_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`resume_id`) REFERENCES `resumes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_resume_versions_revision` ON `resume_versions` (`resume_id`,`revision`);--> statement-breakpoint
CREATE TABLE `resumes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`track` text NOT NULL,
	`target_profile_id` text,
	`target_name` text NOT NULL,
	`template_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`content_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_profile_id`) REFERENCES `target_profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_resumes_user_updated` ON `resumes` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_resumes_user_status` ON `resumes` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `suggestion_events` (
	`id` text PRIMARY KEY NOT NULL,
	`resume_id` text,
	`target_profile_id` text,
	`section` text NOT NULL,
	`score` integer NOT NULL,
	`provider` text DEFAULT 'local-rules' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`resume_id`) REFERENCES `resumes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_suggestion_events_resume` ON `suggestion_events` (`resume_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `target_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`track` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`region` text NOT NULL,
	`description` text NOT NULL,
	`keywords_json` text NOT NULL,
	`priorities_json` text NOT NULL,
	`tone` text NOT NULL,
	`source_type` text DEFAULT 'editorial' NOT NULL,
	`reviewed_at` text NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_target_profiles_track_active` ON `target_profiles` (`track`,`active`);--> statement-breakpoint
CREATE TABLE `templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`track` text NOT NULL,
	`accent` text NOT NULL,
	`layout` text NOT NULL,
	`tags_json` text NOT NULL,
	`recommended_for_json` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_templates_track_active` ON `templates` (`track`,`active`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_email` ON `users` (`email`);
--> statement-breakpoint
CREATE TABLE `guest_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_guest_sessions_user` ON `guest_sessions` (`user_id`);
