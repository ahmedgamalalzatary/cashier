CREATE TABLE `external_catalog_sync` (
	`id` int NOT NULL,
	`last_successful_sync_at` timestamp,
	`last_attempt_at` timestamp,
	`last_error` varchar(500),
	CONSTRAINT `external_catalog_sync_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `external_categories` (
	`external_id` int NOT NULL,
	`name_ar` varchar(191) NOT NULL,
	`name_en` varchar(191) NOT NULL,
	`description_ar` text,
	`description_en` text,
	`is_active` boolean NOT NULL,
	`is_visible` boolean NOT NULL,
	`display_order` int NOT NULL,
	`is_current` boolean NOT NULL DEFAULT true,
	`synced_at` timestamp NOT NULL,
	CONSTRAINT `external_categories_external_id` PRIMARY KEY(`external_id`)
);
--> statement-breakpoint
CREATE TABLE `external_modifier_groups` (
	`external_id` int NOT NULL,
	`external_product_id` int NOT NULL,
	`name_ar` varchar(191) NOT NULL,
	`name_en` varchar(191) NOT NULL,
	`is_required` boolean NOT NULL,
	`max_selections` int NOT NULL,
	`is_current` boolean NOT NULL DEFAULT true,
	`synced_at` timestamp NOT NULL,
	CONSTRAINT `external_modifier_groups_external_id` PRIMARY KEY(`external_id`)
);
--> statement-breakpoint
CREATE TABLE `external_modifier_ingredients` (
	`external_modifier_option_id` int NOT NULL,
	`item_id` int NOT NULL,
	`quantity` decimal(14,3) NOT NULL,
	CONSTRAINT `external_modifier_ingredients_uidx` UNIQUE(`external_modifier_option_id`,`item_id`)
);
--> statement-breakpoint
CREATE TABLE `external_modifier_options` (
	`external_id` int NOT NULL,
	`external_modifier_group_id` int NOT NULL,
	`name_ar` varchar(191) NOT NULL,
	`name_en` varchar(191) NOT NULL,
	`extra_price` decimal(12,2) NOT NULL,
	`stock_effect` enum('incomplete','mapped','none') NOT NULL DEFAULT 'incomplete',
	`is_current` boolean NOT NULL DEFAULT true,
	`synced_at` timestamp NOT NULL,
	CONSTRAINT `external_modifier_options_external_id` PRIMARY KEY(`external_id`)
);
--> statement-breakpoint
CREATE TABLE `external_product_ingredients` (
	`external_product_id` int NOT NULL,
	`item_id` int NOT NULL,
	`quantity` decimal(14,3) NOT NULL,
	CONSTRAINT `external_product_ingredients_uidx` UNIQUE(`external_product_id`,`item_id`)
);
--> statement-breakpoint
CREATE TABLE `external_product_sizes` (
	`external_id` int NOT NULL,
	`external_product_id` int NOT NULL,
	`name_ar` varchar(191) NOT NULL,
	`name_en` varchar(191) NOT NULL,
	`price` decimal(12,2) NOT NULL,
	`is_default` boolean NOT NULL,
	`is_current` boolean NOT NULL DEFAULT true,
	`synced_at` timestamp NOT NULL,
	CONSTRAINT `external_product_sizes_external_id` PRIMARY KEY(`external_id`)
);
--> statement-breakpoint
CREATE TABLE `external_products` (
	`external_id` int NOT NULL,
	`external_category_id` int NOT NULL,
	`name_ar` varchar(191) NOT NULL,
	`name_en` varchar(191) NOT NULL,
	`description_ar` text,
	`description_en` text,
	`image_url` varchar(2048),
	`price` decimal(12,2) NOT NULL,
	`discount_percentage` decimal(5,2),
	`discount_start` varchar(40),
	`discount_end` varchar(40),
	`calories` int NOT NULL,
	`points_reward` int NOT NULL,
	`is_available` boolean NOT NULL,
	`is_visible` boolean NOT NULL,
	`is_current` boolean NOT NULL DEFAULT true,
	`synced_at` timestamp NOT NULL,
	CONSTRAINT `external_products_external_id` PRIMARY KEY(`external_id`)
);
--> statement-breakpoint
CREATE TABLE `external_size_ingredients` (
	`external_size_id` int NOT NULL,
	`item_id` int NOT NULL,
	`quantity` decimal(14,3) NOT NULL,
	CONSTRAINT `external_size_ingredients_uidx` UNIQUE(`external_size_id`,`item_id`)
);
--> statement-breakpoint
ALTER TABLE `external_modifier_groups` ADD CONSTRAINT `ext_mod_grp_prod_fk` FOREIGN KEY (`external_product_id`) REFERENCES `external_products`(`external_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_modifier_ingredients` ADD CONSTRAINT `ext_mod_ing_opt_fk` FOREIGN KEY (`external_modifier_option_id`) REFERENCES `external_modifier_options`(`external_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_modifier_ingredients` ADD CONSTRAINT `external_modifier_ingredients_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_modifier_options` ADD CONSTRAINT `ext_mod_opt_grp_fk` FOREIGN KEY (`external_modifier_group_id`) REFERENCES `external_modifier_groups`(`external_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_product_ingredients` ADD CONSTRAINT `ext_prod_ing_prod_fk` FOREIGN KEY (`external_product_id`) REFERENCES `external_products`(`external_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_product_ingredients` ADD CONSTRAINT `external_product_ingredients_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_product_sizes` ADD CONSTRAINT `ext_size_prod_fk` FOREIGN KEY (`external_product_id`) REFERENCES `external_products`(`external_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_products` ADD CONSTRAINT `ext_prod_cat_fk` FOREIGN KEY (`external_category_id`) REFERENCES `external_categories`(`external_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_size_ingredients` ADD CONSTRAINT `ext_size_ing_size_fk` FOREIGN KEY (`external_size_id`) REFERENCES `external_product_sizes`(`external_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_size_ingredients` ADD CONSTRAINT `external_size_ingredients_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `external_modifier_groups_product_idx` ON `external_modifier_groups` (`external_product_id`);--> statement-breakpoint
CREATE INDEX `external_modifier_ingredients_item_idx` ON `external_modifier_ingredients` (`item_id`);--> statement-breakpoint
CREATE INDEX `external_modifier_options_group_idx` ON `external_modifier_options` (`external_modifier_group_id`);--> statement-breakpoint
CREATE INDEX `external_product_ingredients_item_idx` ON `external_product_ingredients` (`item_id`);--> statement-breakpoint
CREATE INDEX `external_product_sizes_product_idx` ON `external_product_sizes` (`external_product_id`);--> statement-breakpoint
CREATE INDEX `external_products_category_idx` ON `external_products` (`external_category_id`);--> statement-breakpoint
CREATE INDEX `external_products_current_idx` ON `external_products` (`is_current`);--> statement-breakpoint
CREATE INDEX `external_size_ingredients_item_idx` ON `external_size_ingredients` (`item_id`);
