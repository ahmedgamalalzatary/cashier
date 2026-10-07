ALTER TABLE `refund_lines` DROP CONSTRAINT `refund_lines_action_type_chk`;--> statement-breakpoint
UPDATE `refund_lines` SET `stock_action` = 'not_returnable' WHERE `type` = 'external_product' AND `stock_action` IS NULL;--> statement-breakpoint
ALTER TABLE `refund_lines` ADD CONSTRAINT `refund_lines_action_type_chk` CHECK (((`refund_lines`.`type` IN ('item', 'external_product') AND `refund_lines`.`stock_action` IS NOT NULL) OR (`refund_lines`.`type` = 'recipe' AND `refund_lines`.`stock_action` IS NULL)));
