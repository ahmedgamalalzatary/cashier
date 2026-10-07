CREATE TABLE `items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(191) NOT NULL,
	`category_id` int NOT NULL,
	`type` enum('raw','resale','prepared') NOT NULL,
	`stock_unit` varchar(50) NOT NULL,
	`purchase_unit` varchar(50),
	`purchase_to_stock_factor` decimal(14,6),
	`main_minimum_level` decimal(14,3) NOT NULL DEFAULT '0',
	`cafe_minimum_level` decimal(14,3) NOT NULL DEFAULT '0',
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stock_batches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`item_id` int NOT NULL,
	`warehouse` enum('main','cafe') NOT NULL,
	`initial_quantity` decimal(14,3) NOT NULL,
	`remaining_quantity` decimal(14,3) NOT NULL,
	`unit_cost` decimal(16,6) NOT NULL,
	`received_at` timestamp NOT NULL,
	`source_type` varchar(50) NOT NULL,
	`source_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stock_batches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`item_id` int NOT NULL,
	`warehouse` enum('main','cafe') NOT NULL,
	`batch_id` int,
	`movement_type` varchar(50) NOT NULL,
	`quantity` decimal(14,3) NOT NULL,
	`unit_cost` decimal(16,6) NOT NULL,
	`reference_type` varchar(50),
	`reference_id` int,
	`notes` varchar(255),
	`occurred_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stock_movements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `items` ADD CONSTRAINT `items_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_batches` ADD CONSTRAINT `stock_batches_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_batch_id_stock_batches_id_fk` FOREIGN KEY (`batch_id`) REFERENCES `stock_batches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `items_category_id_idx` ON `items` (`category_id`);--> statement-breakpoint
CREATE INDEX `stock_batches_fifo_idx` ON `stock_batches` (`item_id`,`warehouse`,`received_at`,`id`);--> statement-breakpoint
CREATE INDEX `stock_movements_ledger_idx` ON `stock_movements` (`item_id`,`warehouse`,`occurred_at`,`id`);--> statement-breakpoint
CREATE INDEX `stock_movements_batch_id_idx` ON `stock_movements` (`batch_id`);