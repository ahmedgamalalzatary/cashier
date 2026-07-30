CREATE TABLE `waste_allocations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`waste_entry_id` int NOT NULL,
	`item_id` int NOT NULL,
	`item_name` varchar(191) NOT NULL,
	`batch_id` int,
	`stock_movement_id` int NOT NULL,
	`quantity` decimal(14,3) NOT NULL,
	`unit_cost` decimal(16,6) NOT NULL,
	CONSTRAINT `waste_allocations_id` PRIMARY KEY(`id`),
	CONSTRAINT `waste_allocations_movement_uidx` UNIQUE(`stock_movement_id`),
	CONSTRAINT `waste_allocations_quantity_positive_chk` CHECK(`waste_allocations`.`quantity` > 0),
	CONSTRAINT `waste_allocations_cost_nonnegative_chk` CHECK(`waste_allocations`.`unit_cost` >= 0)
);
--> statement-breakpoint
ALTER TABLE `waste_entries` MODIFY COLUMN `item_id` int;--> statement-breakpoint
ALTER TABLE `waste_entries` ADD `client_request_id` varchar(36);--> statement-breakpoint
ALTER TABLE `waste_entries` ADD `request_fingerprint` varchar(64);--> statement-breakpoint
ALTER TABLE `waste_entries` ADD `shift_id` int;--> statement-breakpoint
ALTER TABLE `waste_entries` ADD `target_type` enum('item','recipe');--> statement-breakpoint
ALTER TABLE `waste_entries` ADD `recipe_id` int;--> statement-breakpoint
ALTER TABLE `waste_entries` ADD `recipe_size_id` int;--> statement-breakpoint
ALTER TABLE `waste_entries` ADD `target_name` varchar(191);--> statement-breakpoint
ALTER TABLE `waste_entries` ADD `size_name` varchar(100);--> statement-breakpoint
ALTER TABLE `waste_entries` ADD `reason_code` enum('expired','damaged','preparation_mistake','spill','other');--> statement-breakpoint
ALTER TABLE `waste_entries` ADD `note` varchar(500);--> statement-breakpoint
UPDATE `waste_entries`
INNER JOIN `items` ON `items`.`id` = `waste_entries`.`item_id`
INNER JOIN `refund_lines` ON `refund_lines`.`id` = `waste_entries`.`refund_line_id`
INNER JOIN `refunds` ON `refunds`.`id` = `refund_lines`.`refund_id`
SET
	`waste_entries`.`shift_id` = `refunds`.`shift_id`,
	`waste_entries`.`target_type` = 'item',
	`waste_entries`.`target_name` = `items`.`name`,
	`waste_entries`.`reason_code` = 'other',
	`waste_entries`.`note` = `waste_entries`.`reason`
WHERE `waste_entries`.`refund_line_id` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `waste_entries` ADD CONSTRAINT `waste_entries_direct_shape_chk` CHECK(
	`waste_entries`.`refund_line_id` IS NOT NULL
	OR (
		`waste_entries`.`client_request_id` IS NOT NULL
		AND `waste_entries`.`reason_code` IS NOT NULL
		AND (
			(
				`waste_entries`.`target_type` = 'item'
				AND `waste_entries`.`item_id` IS NOT NULL
				AND `waste_entries`.`recipe_id` IS NULL
				AND `waste_entries`.`recipe_size_id` IS NULL
			)
			OR (
				`waste_entries`.`target_type` = 'recipe'
				AND `waste_entries`.`item_id` IS NULL
				AND `waste_entries`.`recipe_id` IS NOT NULL
				AND `waste_entries`.`recipe_size_id` IS NOT NULL
			)
		)
	)
);--> statement-breakpoint
ALTER TABLE `waste_entries` ADD CONSTRAINT `waste_entries_client_request_id_unique` UNIQUE(`client_request_id`);--> statement-breakpoint
ALTER TABLE `waste_allocations` ADD CONSTRAINT `waste_allocations_waste_entry_id_waste_entries_id_fk` FOREIGN KEY (`waste_entry_id`) REFERENCES `waste_entries`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `waste_allocations` ADD CONSTRAINT `waste_allocations_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `waste_allocations` ADD CONSTRAINT `waste_allocations_batch_id_stock_batches_id_fk` FOREIGN KEY (`batch_id`) REFERENCES `stock_batches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `waste_allocations` ADD CONSTRAINT `waste_allocations_stock_movement_id_stock_movements_id_fk` FOREIGN KEY (`stock_movement_id`) REFERENCES `stock_movements`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `waste_allocations_entry_idx` ON `waste_allocations` (`waste_entry_id`);--> statement-breakpoint
CREATE INDEX `waste_allocations_item_idx` ON `waste_allocations` (`item_id`);--> statement-breakpoint
ALTER TABLE `waste_entries` ADD CONSTRAINT `waste_entries_shift_id_shifts_id_fk` FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `waste_entries` ADD CONSTRAINT `waste_entries_recipe_id_recipes_id_fk` FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `waste_entries` ADD CONSTRAINT `waste_entries_recipe_size_id_recipe_sizes_id_fk` FOREIGN KEY (`recipe_size_id`) REFERENCES `recipe_sizes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `waste_entries_shift_idx` ON `waste_entries` (`shift_id`);
