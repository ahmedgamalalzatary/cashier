CREATE TABLE `preparation_allocations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`preparation_id` int NOT NULL,
	`ingredient_item_id` int NOT NULL,
	`ingredient_item_name` varchar(191) NOT NULL,
	`quantity` decimal(14,3) NOT NULL,
	`unit_cost` decimal(16,6) NOT NULL,
	`source_batch_id` int NOT NULL,
	CONSTRAINT `preparation_allocations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `preparations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`recipe_id` int NOT NULL,
	`recipe_name` varchar(191) NOT NULL,
	`output_item_id` int NOT NULL,
	`output_item_name` varchar(191) NOT NULL,
	`produced_quantity` decimal(14,3) NOT NULL,
	`total_cost` decimal(30,2) NOT NULL,
	`unit_cost` decimal(16,6) NOT NULL,
	`output_batch_id` int,
	`prepared_by` int NOT NULL,
	`notes` text,
	`occurred_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `preparations_id` PRIMARY KEY(`id`),
	CONSTRAINT `preparations_output_batch_uidx` UNIQUE(`output_batch_id`)
);
--> statement-breakpoint
CREATE TABLE `recipe_ingredients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`recipe_size_id` int NOT NULL,
	`item_id` int NOT NULL,
	`quantity` decimal(14,3) NOT NULL,
	CONSTRAINT `recipe_ingredients_id` PRIMARY KEY(`id`),
	CONSTRAINT `recipe_ingredients_size_item_uidx` UNIQUE(`recipe_size_id`,`item_id`)
);
--> statement-breakpoint
CREATE TABLE `recipe_sizes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`recipe_id` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`selling_price` decimal(12,2),
	`output_quantity` decimal(14,3),
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `recipe_sizes_id` PRIMARY KEY(`id`),
	CONSTRAINT `recipe_sizes_recipe_name_uidx` UNIQUE(`recipe_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(191) NOT NULL,
	`type` enum('product','prepared') NOT NULL,
	`category_id` int NOT NULL,
	`output_item_id` int,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `recipes_id` PRIMARY KEY(`id`),
	CONSTRAINT `recipes_output_item_id_uidx` UNIQUE(`output_item_id`)
);
--> statement-breakpoint
ALTER TABLE `preparation_allocations` ADD CONSTRAINT `preparation_allocations_preparation_id_preparations_id_fk` FOREIGN KEY (`preparation_id`) REFERENCES `preparations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `preparation_allocations` ADD CONSTRAINT `preparation_allocations_ingredient_item_id_items_id_fk` FOREIGN KEY (`ingredient_item_id`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `preparation_allocations` ADD CONSTRAINT `preparation_allocations_source_batch_id_stock_batches_id_fk` FOREIGN KEY (`source_batch_id`) REFERENCES `stock_batches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `preparations` ADD CONSTRAINT `preparations_recipe_id_recipes_id_fk` FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `preparations` ADD CONSTRAINT `preparations_output_item_id_items_id_fk` FOREIGN KEY (`output_item_id`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `preparations` ADD CONSTRAINT `preparations_output_batch_id_stock_batches_id_fk` FOREIGN KEY (`output_batch_id`) REFERENCES `stock_batches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `preparations` ADD CONSTRAINT `preparations_prepared_by_users_id_fk` FOREIGN KEY (`prepared_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipe_ingredients` ADD CONSTRAINT `recipe_ingredients_recipe_size_id_recipe_sizes_id_fk` FOREIGN KEY (`recipe_size_id`) REFERENCES `recipe_sizes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipe_ingredients` ADD CONSTRAINT `recipe_ingredients_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipe_sizes` ADD CONSTRAINT `recipe_sizes_recipe_id_recipes_id_fk` FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipes` ADD CONSTRAINT `recipes_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipes` ADD CONSTRAINT `recipes_output_item_id_items_id_fk` FOREIGN KEY (`output_item_id`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `preparation_allocations_preparation_idx` ON `preparation_allocations` (`preparation_id`);--> statement-breakpoint
CREATE INDEX `preparation_allocations_item_idx` ON `preparation_allocations` (`ingredient_item_id`);--> statement-breakpoint
CREATE INDEX `preparations_recipe_id_idx` ON `preparations` (`recipe_id`);--> statement-breakpoint
CREATE INDEX `preparations_occurred_at_idx` ON `preparations` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `recipe_ingredients_item_id_idx` ON `recipe_ingredients` (`item_id`);--> statement-breakpoint
CREATE INDEX `recipe_sizes_recipe_id_idx` ON `recipe_sizes` (`recipe_id`);--> statement-breakpoint
CREATE INDEX `recipes_category_id_idx` ON `recipes` (`category_id`);