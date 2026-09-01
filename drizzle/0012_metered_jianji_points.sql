-- Re-denominate the launch economy from per-request credits to Jianji points.
-- One legacy credit becomes five points so existing users keep the same
-- approximate purchasing power while future successful calls can cost 1–5.
UPDATE `ai_credit_lots`
SET `initial_credits` = `initial_credits` * 5,
    `remaining_credits` = `remaining_credits` * 5;
--> statement-breakpoint
UPDATE `ai_credit_ledger` SET `credits` = `credits` * 5;
--> statement-breakpoint
UPDATE `credit_orders` SET `credits` = `credits` * 5;
--> statement-breakpoint
UPDATE `model_advice_deliveries`
SET `response_json` = json_set(
  `response_json`,
  '$.creditCharged',
  CAST(json_extract(`response_json`, '$.creditCharged') AS INTEGER) * 5
)
WHERE CASE WHEN json_valid(`response_json`) = 1 THEN
    json_type(`response_json`, '$.creditCharged') = 'integer'
      AND CAST(json_extract(`response_json`, '$.creditCharged') AS INTEGER) > 0
  ELSE 0 END;
--> statement-breakpoint

-- Only a reserved entry may become consumed/released. A successful settlement
-- may lower the frozen point ceiling, but it can never charge above it.
CREATE TRIGGER `trg_ai_credit_ledger_settlement_integrity`
BEFORE UPDATE OF `status`, `credits`, `lot_id`, `user_id`, `request_id` ON `ai_credit_ledger`
WHEN NEW.`lot_id` <> OLD.`lot_id`
  OR NEW.`user_id` <> OLD.`user_id`
  OR NEW.`request_id` <> OLD.`request_id`
  OR (OLD.`status` <> 'reserved'
    AND (NEW.`status` <> OLD.`status` OR NEW.`credits` <> OLD.`credits`))
  OR (OLD.`status` = 'reserved' AND NEW.`status` = 'reserved'
    AND NEW.`credits` <> OLD.`credits`)
  OR (OLD.`status` = 'reserved' AND NEW.`status` = 'consumed'
    AND (NEW.`credits` < 1 OR NEW.`credits` > OLD.`credits`))
  OR (OLD.`status` = 'reserved' AND NEW.`status` = 'released'
    AND NEW.`credits` <> OLD.`credits`)
  OR (OLD.`status` = 'reserved'
    AND NEW.`status` NOT IN ('reserved','consumed','released'))
BEGIN
  SELECT RAISE(ABORT, 'AI point settlement integrity constraint');
END;
--> statement-breakpoint

-- Refund the unused portion of a successful reservation, or all frozen points
-- on a no-charge release. The trigger runs inside the same transaction as the
-- ledger transition, so balance and settlement cannot diverge.
CREATE TRIGGER `trg_ai_credit_ledger_settlement_refund`
AFTER UPDATE OF `status`, `credits` ON `ai_credit_ledger`
WHEN OLD.`status` = 'reserved' AND NEW.`status` IN ('consumed','released')
BEGIN
  UPDATE `ai_credit_lots`
  SET `remaining_credits` = `remaining_credits` + CASE
    WHEN NEW.`status` = 'released' THEN OLD.`credits`
    ELSE OLD.`credits` - NEW.`credits`
  END
  WHERE `id` = OLD.`lot_id` AND `user_id` = OLD.`user_id`;
END;
--> statement-breakpoint

UPDATE `app_schema_meta`
SET `version` = 12, `updated_at` = CURRENT_TIMESTAMP
WHERE `key` = 'app';
