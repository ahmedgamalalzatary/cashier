ALTER TABLE `refunds` DROP CONSTRAINT `refunds_amount_positive_chk`;--> statement-breakpoint
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_amount_positive_chk` CHECK ((`refunds`.`amount` >= 0));
