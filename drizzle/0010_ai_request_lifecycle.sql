ALTER TABLE `model_advice_deliveries` ADD COLUMN `attempt_state` text DEFAULT 'prepared' NOT NULL
  CHECK (`attempt_state` IN ('prepared','provider_started','settlement_pending','succeeded','fallback','abandoned','expired'));
--> statement-breakpoint
ALTER TABLE `model_advice_deliveries` ADD COLUMN `provider_key` text;
--> statement-breakpoint
ALTER TABLE `model_advice_deliveries` ADD COLUMN `credit_ledger_id` text;
--> statement-breakpoint
ALTER TABLE `model_advice_deliveries` ADD COLUMN `provider_response_id` text;
--> statement-breakpoint
ALTER TABLE `model_advice_deliveries` ADD COLUMN `started_at` text;
--> statement-breakpoint
ALTER TABLE `model_advice_deliveries` ADD COLUMN `updated_at` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `model_advice_deliveries` ADD COLUMN `terminal_at` text;
--> statement-breakpoint
ALTER TABLE `model_advice_deliveries` ADD COLUMN `failure_kind` text;
--> statement-breakpoint
UPDATE `model_advice_deliveries`
SET `attempt_state` = CASE WHEN `response_json` = '__pending__' THEN 'prepared' ELSE 'succeeded' END,
    `updated_at` = `created_at`,
    `terminal_at` = CASE WHEN `response_json` = '__pending__' THEN NULL ELSE `created_at` END;
--> statement-breakpoint
CREATE INDEX `idx_model_advice_deliveries_state_updated`
ON `model_advice_deliveries` (`attempt_state`,`updated_at`);
--> statement-breakpoint
CREATE TRIGGER `trg_users_identity_owner_lease`
BEFORE UPDATE OF `email`,`email_verified`,`phone_number`,`phone_number_verified` ON `users`
WHEN EXISTS (
  SELECT 1 FROM `model_session_leases`
  WHERE `owner_key` = OLD.`id`
    AND `expires_at` >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
BEGIN
  SELECT RAISE(ABORT, 'identity mutation blocked by active owner lease');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_auth_accounts_insert_owner_lease`
BEFORE INSERT ON `auth_accounts`
WHEN EXISTS (
  SELECT 1 FROM `model_session_leases`
  WHERE `owner_key` = NEW.`user_id`
    AND `expires_at` >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
BEGIN
  SELECT RAISE(ABORT, 'identity mutation blocked by active owner lease');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_auth_accounts_update_owner_lease`
BEFORE UPDATE OF `user_id`,`provider_id`,`account_id`,`issuer` ON `auth_accounts`
WHEN EXISTS (
  SELECT 1 FROM `model_session_leases`
  WHERE `owner_key` IN (OLD.`user_id`, NEW.`user_id`)
    AND `expires_at` >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
BEGIN
  SELECT RAISE(ABORT, 'identity mutation blocked by active owner lease');
END;
--> statement-breakpoint
CREATE TRIGGER `trg_auth_accounts_delete_owner_lease`
BEFORE DELETE ON `auth_accounts`
WHEN EXISTS (
  SELECT 1 FROM `model_session_leases`
  WHERE `owner_key` = OLD.`user_id`
    AND `expires_at` >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
)
BEGIN
  SELECT RAISE(ABORT, 'identity mutation blocked by active owner lease');
END;
--> statement-breakpoint
UPDATE `app_schema_meta` SET `version` = 10, `updated_at` = CURRENT_TIMESTAMP WHERE `key` = 'app';
