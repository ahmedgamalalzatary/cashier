CREATE TABLE `order_line_allocations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`order_line_id` int NOT NULL,
	`item_id` int NOT NULL,
	`item_name` varchar(191) NOT NULL,
	`batch_id` int,
	`stock_movement_id` int NOT NULL,
	`quantity` decimal(14,3) NOT NULL,
	`unit_cost` decimal(16,6) NOT NULL,
	CONSTRAINT `order_line_allocations_id` PRIMARY KEY(`id`),
	CONSTRAINT `order_line_allocations_movement_uidx` UNIQUE(`stock_movement_id`)
);
--> statement-breakpoint
CREATE TABLE `order_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`order_id` int NOT NULL,
	`type` enum('recipe','item') NOT NULL,
	`recipe_id` int,
	`recipe_size_id` int,
	`item_id` int,
	`product_name` varchar(191) NOT NULL,
	`size_name` varchar(100),
	`quantity` decimal(14,3) NOT NULL,
	`unit_price` decimal(12,2) NOT NULL,
	`line_subtotal` decimal(12,2) NOT NULL,
	`total_cost` decimal(30,2) NOT NULL DEFAULT '0',
	`has_stock_deficit` boolean NOT NULL DEFAULT false,
	CONSTRAINT `order_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`order_number` varchar(64) NOT NULL,
	`cashier_id` int NOT NULL,
	`shift_id` int,
	`subtotal` decimal(12,2) NOT NULL,
	`discount_type` enum('percent','fixed'),
	`discount_value` decimal(12,2),
	`discount_amount` decimal(12,2) NOT NULL DEFAULT '0',
	`total` decimal(12,2) NOT NULL,
	`cash_received` decimal(12,2) NOT NULL,
	`change_amount` decimal(12,2) NOT NULL,
	`total_cost` decimal(30,2) NOT NULL DEFAULT '0',
	`is_negative_stock` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_order_number_unique` UNIQUE(`order_number`)
);
--> statement-breakpoint
ALTER TABLE `items` ADD `selling_price` decimal(12,2);--> statement-breakpoint
ALTER TABLE `order_line_allocations` ADD CONSTRAINT `order_line_allocations_order_line_id_order_lines_id_fk` FOREIGN KEY (`order_line_id`) REFERENCES `order_lines`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_line_allocations` ADD CONSTRAINT `order_line_allocations_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_line_allocations` ADD CONSTRAINT `order_line_allocations_batch_id_stock_batches_id_fk` FOREIGN KEY (`batch_id`) REFERENCES `stock_batches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_line_allocations` ADD CONSTRAINT `order_line_allocations_stock_movement_id_stock_movements_id_fk` FOREIGN KEY (`stock_movement_id`) REFERENCES `stock_movements`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_lines` ADD CONSTRAINT `order_lines_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_lines` ADD CONSTRAINT `order_lines_recipe_id_recipes_id_fk` FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_lines` ADD CONSTRAINT `order_lines_recipe_size_id_recipe_sizes_id_fk` FOREIGN KEY (`recipe_size_id`) REFERENCES `recipe_sizes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_lines` ADD CONSTRAINT `order_lines_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_cashier_id_users_id_fk` FOREIGN KEY (`cashier_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `order_line_allocations_line_idx` ON `order_line_allocations` (`order_line_id`);--> statement-breakpoint
CREATE INDEX `order_line_allocations_item_idx` ON `order_line_allocations` (`item_id`);--> statement-breakpoint
CREATE INDEX `order_lines_order_id_idx` ON `order_lines` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_lines_recipe_id_idx` ON `order_lines` (`recipe_id`);--> statement-breakpoint
CREATE INDEX `order_lines_item_id_idx` ON `order_lines` (`item_id`);--> statement-breakpoint
CREATE INDEX `orders_created_at_idx` ON `orders` (`created_at`);--> statement-breakpoint
CREATE INDEX `orders_cashier_created_idx` ON `orders` (`cashier_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_shift_id_idx` ON `orders` (`shift_id`);