CREATE TABLE `stocktake_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`stocktake_id` int NOT NULL,
	`item_id` int NOT NULL,
	`recorded_quantity` decimal(14,3) NOT NULL,
	`counted_quantity` decimal(14,3),
	CONSTRAINT `stocktake_lines_id` PRIMARY KEY(`id`),
	CONSTRAINT `stocktake_lines_document_item_uidx` UNIQUE(`stocktake_id`,`item_id`)
);
--> statement-breakpoint
CREATE TABLE `stocktakes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kind` enum('stocktake','manual') NOT NULL DEFAULT 'stocktake',
	`warehouse` enum('main','cafe') NOT NULL,
	`category_id` int,
	`status` enum('draft','confirmed') NOT NULL DEFAULT 'draft',
	`note` varchar(500),
	`created_by` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`confirmed_at` timestamp,
	CONSTRAINT `stocktakes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `stocktake_lines` ADD CONSTRAINT `stocktake_lines_stocktake_id_stocktakes_id_fk` FOREIGN KEY (`stocktake_id`) REFERENCES `stocktakes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stocktake_lines` ADD CONSTRAINT `stocktake_lines_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stocktakes` ADD CONSTRAINT `stocktakes_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stocktakes` ADD CONSTRAINT `stocktakes_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `stocktake_lines_item_idx` ON `stocktake_lines` (`item_id`);--> statement-breakpoint
CREATE INDEX `stocktakes_created_at_idx` ON `stocktakes` (`created_at`);