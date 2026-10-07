CREATE TABLE `order_line_modifiers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`order_line_id` int NOT NULL,
	`external_modifier_group_id` int NOT NULL,
	`external_modifier_option_id` int NOT NULL,
	`group_name` varchar(191) NOT NULL,
	`option_name` varchar(191) NOT NULL,
	`quantity` int NOT NULL,
	`unit_extra_price` decimal(12,2) NOT NULL,
	CONSTRAINT `order_line_modifiers_id` PRIMARY KEY(`id`),
	CONSTRAINT `order_line_modifiers_line_option_uidx` UNIQUE(`order_line_id`,`external_modifier_option_id`)
);
--> statement-breakpoint
ALTER TABLE `refund_lines` DROP CONSTRAINT `refund_lines_action_type_chk`;--> statement-breakpoint
ALTER TABLE `order_lines` MODIFY COLUMN `type` enum('recipe','item','external_product') NOT NULL;--> statement-breakpoint
ALTER TABLE `refund_lines` MODIFY COLUMN `type` enum('recipe','item','external_product') NOT NULL;--> statement-breakpoint
ALTER TABLE `order_lines` ADD `external_product_id` int;--> statement-breakpoint
ALTER TABLE `order_lines` ADD `external_size_id` int;--> statement-breakpoint
ALTER TABLE `order_line_modifiers` ADD CONSTRAINT `order_line_modifiers_order_line_id_order_lines_id_fk` FOREIGN KEY (`order_line_id`) REFERENCES `order_lines`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `order_line_modifiers_line_idx` ON `order_line_modifiers` (`order_line_id`);--> statement-breakpoint
ALTER TABLE `refund_lines` ADD CONSTRAINT `refund_lines_action_type_chk` CHECK (((`refund_lines`.`type` = 'item' AND `refund_lines`.`stock_action` IS NOT NULL) OR (`refund_lines`.`type` <> 'item' AND `refund_lines`.`stock_action` IS NULL)));--> statement-breakpoint
ALTER TABLE `order_lines` ADD CONSTRAINT `order_lines_external_product_id_external_products_external_id_fk` FOREIGN KEY (`external_product_id`) REFERENCES `external_products`(`external_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_lines` ADD CONSTRAINT `order_line_ext_size_fk` FOREIGN KEY (`external_size_id`) REFERENCES `external_product_sizes`(`external_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `order_lines_external_product_idx` ON `order_lines` (`external_product_id`);
