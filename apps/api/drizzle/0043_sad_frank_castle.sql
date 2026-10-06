ALTER TABLE `refunds` MODIFY COLUMN `shift_id` int;--> statement-breakpoint
ALTER TABLE `orders` ADD `is_admin_sale` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `refunds` ADD `is_admin_refund` boolean DEFAULT false NOT NULL;