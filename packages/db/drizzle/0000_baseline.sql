CREATE TABLE `admin_branches` (
	`admin_user_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	CONSTRAINT `admin_branches_admin_user_id_branch_id_pk` PRIMARY KEY(`admin_user_id`,`branch_id`)
);
--> statement-breakpoint
CREATE TABLE `branches` (
	`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`name` varchar(191) NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `branches_id` PRIMARY KEY(`id`),
	CONSTRAINT `branches_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`name` varchar(191) NOT NULL,
	`parent_id` char(36) CHARACTER SET ascii COLLATE ascii_bin,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `categories_branch_id_uidx` UNIQUE(`branch_id`,`id`)
);
--> statement-breakpoint
CREATE TABLE `devices` (
	`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`linked_at` timestamp(3) NOT NULL DEFAULT (now()),
	`last_seen_at` timestamp(3),
	`app_version` varchar(64),
	`last_upload_at` timestamp(3),
	CONSTRAINT `devices_id` PRIMARY KEY(`id`),
	CONSTRAINT `devices_token_hash_unique` UNIQUE(`token_hash`),
	CONSTRAINT `devices_branch_uidx` UNIQUE(`branch_id`)
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`name` varchar(191) NOT NULL,
	`phone` varchar(50),
	`job_title` varchar(100),
	`hire_date` date,
	`pay_rate` decimal(12,2),
	`notes` text,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `employees_id` PRIMARY KEY(`id`),
	CONSTRAINT `employees_branch_id_uidx` UNIQUE(`branch_id`,`id`)
);
--> statement-breakpoint
CREATE TABLE `expense_categories` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`name` varchar(191) NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `expense_categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `expense_categories_branch_id_uidx` UNIQUE(`branch_id`,`id`),
	CONSTRAINT `expense_categories_name_uidx` UNIQUE(`branch_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `expenses` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`client_request_id` varchar(36) NOT NULL,
	`request_fingerprint` varchar(64) NOT NULL,
	`type` enum('shift','general') NOT NULL,
	`category_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`shift_id` char(36) CHARACTER SET ascii COLLATE ascii_bin,
	`amount` decimal(12,2) NOT NULL,
	`expense_date` date NOT NULL,
	`note` varchar(500),
	`recorded_by` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `expenses_id` PRIMARY KEY(`id`),
	CONSTRAINT `expenses_branch_id_uidx` UNIQUE(`branch_id`,`id`),
	CONSTRAINT `expenses_clientRequestId_branch_uidx` UNIQUE(`branch_id`,`client_request_id`),
	CONSTRAINT `expenses_amount_positive_chk` CHECK(`expenses`.`amount` > 0),
	CONSTRAINT `expenses_type_shift_chk` CHECK(((`expenses`.`type` = 'shift' AND `expenses`.`shift_id` IS NOT NULL) OR (`expenses`.`type` = 'general' AND `expenses`.`shift_id` IS NULL)))
);
--> statement-breakpoint
CREATE TABLE `external_catalog_sync` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`id` int NOT NULL,
	`last_successful_sync_at` timestamp(3),
	`last_attempt_at` timestamp(3),
	`last_failed_at` timestamp(3),
	`last_error` varchar(500),
	`refresh_requested_at` timestamp(3),
	`refresh_request_version` int NOT NULL DEFAULT 0,
	`completed_request_version` int NOT NULL DEFAULT 0,
	`lock_owner` varchar(191),
	`lock_expires_at` timestamp(3),
	CONSTRAINT `external_catalog_sync_branch_id_id_pk` PRIMARY KEY(`branch_id`,`id`)
);
--> statement-breakpoint
CREATE TABLE `external_categories` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
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
	CONSTRAINT `external_categories_branch_id_external_id_pk` PRIMARY KEY(`branch_id`,`external_id`)
);
--> statement-breakpoint
CREATE TABLE `external_modifier_groups` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`external_id` int NOT NULL,
	`external_product_id` int NOT NULL,
	`name_ar` varchar(191),
	`name_en` varchar(191),
	`is_required` boolean NOT NULL,
	`max_selections` int NOT NULL,
	`is_current` boolean NOT NULL DEFAULT true,
	`synced_at` timestamp NOT NULL,
	CONSTRAINT `external_modifier_groups_branch_id_external_id_pk` PRIMARY KEY(`branch_id`,`external_id`)
);
--> statement-breakpoint
CREATE TABLE `external_modifier_ingredients` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`external_modifier_option_id` int NOT NULL,
	`item_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`quantity` decimal(14,3) NOT NULL,
	CONSTRAINT `ext_modifier_ingredients_pk` PRIMARY KEY(`branch_id`,`external_modifier_option_id`,`item_id`)
);
--> statement-breakpoint
CREATE TABLE `external_modifier_options` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`external_id` int NOT NULL,
	`external_modifier_group_id` int NOT NULL,
	`name_ar` varchar(191),
	`name_en` varchar(191),
	`extra_price` decimal(12,2) NOT NULL,
	`stock_effect` enum('incomplete','mapped','none') NOT NULL DEFAULT 'incomplete',
	`is_current` boolean NOT NULL DEFAULT true,
	`synced_at` timestamp NOT NULL,
	CONSTRAINT `external_modifier_options_branch_id_external_id_pk` PRIMARY KEY(`branch_id`,`external_id`)
);
--> statement-breakpoint
CREATE TABLE `external_orders_cache` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`external_id` int NOT NULL,
	`customer_name` varchar(191) NOT NULL,
	`customer_phone` varchar(32),
	`subtotal` decimal(12,2) NOT NULL,
	`discount_amount` decimal(12,2) NOT NULL,
	`total_amount` decimal(12,2) NOT NULL,
	`delivery_fee` decimal(12,2) NOT NULL,
	`external_created_at` varchar(40) NOT NULL,
	`order_status` enum('pending','completed','cancelled','unknown') NOT NULL,
	`payment_status` enum('pending','paid','failed','cancelled','unpaid','unknown') NOT NULL,
	`payment_method` enum('cash_on_delivery','online','onsite','unknown') NOT NULL,
	`order_type` enum('pickup','delivery','unknown') NOT NULL,
	`item_count` int NOT NULL,
	`cached_at` timestamp NOT NULL,
	CONSTRAINT `external_orders_cache_branch_id_external_id_pk` PRIMARY KEY(`branch_id`,`external_id`)
);
--> statement-breakpoint
CREATE TABLE `external_product_ingredients` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`external_product_id` int NOT NULL,
	`item_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`quantity` decimal(14,3) NOT NULL,
	CONSTRAINT `ext_product_ingredients_pk` PRIMARY KEY(`branch_id`,`external_product_id`,`item_id`)
);
--> statement-breakpoint
CREATE TABLE `external_product_sizes` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`external_id` int NOT NULL,
	`external_product_id` int NOT NULL,
	`name_ar` varchar(191) NOT NULL,
	`name_en` varchar(191) NOT NULL,
	`price` decimal(12,2) NOT NULL,
	`is_default` boolean NOT NULL,
	`is_current` boolean NOT NULL DEFAULT true,
	`synced_at` timestamp NOT NULL,
	CONSTRAINT `external_product_sizes_branch_id_external_id_pk` PRIMARY KEY(`branch_id`,`external_id`)
);
--> statement-breakpoint
CREATE TABLE `external_products` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
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
	CONSTRAINT `external_products_branch_id_external_id_pk` PRIMARY KEY(`branch_id`,`external_id`)
);
--> statement-breakpoint
CREATE TABLE `external_size_ingredients` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`external_size_id` int NOT NULL,
	`item_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`quantity` decimal(14,3) NOT NULL,
	CONSTRAINT `ext_size_ingredients_pk` PRIMARY KEY(`branch_id`,`external_size_id`,`item_id`)
);
--> statement-breakpoint
CREATE TABLE `items` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`code` int NOT NULL,
	`name` varchar(191) NOT NULL,
	`category_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`type` enum('raw','resale','prepared') NOT NULL,
	`selling_price` decimal(12,2),
	`stock_unit` varchar(50) NOT NULL,
	`purchase_unit` varchar(50),
	`purchase_to_stock_factor` decimal(14,6),
	`main_minimum_level` decimal(14,3) NOT NULL DEFAULT '0',
	`cafe_minimum_level` decimal(14,3) NOT NULL DEFAULT '0',
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `items_id` PRIMARY KEY(`id`),
	CONSTRAINT `items_branch_id_uidx` UNIQUE(`branch_id`,`id`),
	CONSTRAINT `items_code_uidx` UNIQUE(`branch_id`,`code`)
);
--> statement-breakpoint
CREATE TABLE `link_codes` (
	`code_hash` varchar(64) NOT NULL,
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`expires_at` timestamp(3) NOT NULL,
	`used_at` timestamp(3),
	CONSTRAINT `link_codes_code_hash` PRIMARY KEY(`code_hash`)
);
--> statement-breakpoint
CREATE TABLE `order_line_allocations` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`order_line_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`item_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`item_name` varchar(191) NOT NULL,
	`batch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin,
	`stock_movement_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`quantity` decimal(14,3) NOT NULL,
	`unit_cost` decimal(16,6) NOT NULL,
	CONSTRAINT `order_line_allocations_id` PRIMARY KEY(`id`),
	CONSTRAINT `order_line_allocations_branch_id_uidx` UNIQUE(`branch_id`,`id`),
	CONSTRAINT `order_line_allocations_movement_uidx` UNIQUE(`branch_id`,`stock_movement_id`)
);
--> statement-breakpoint
CREATE TABLE `order_line_modifiers` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`order_line_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`external_modifier_group_id` int NOT NULL,
	`external_modifier_option_id` int NOT NULL,
	`group_name` varchar(191) NOT NULL,
	`option_name` varchar(191) NOT NULL,
	`quantity` int NOT NULL,
	`unit_extra_price` decimal(12,2) NOT NULL,
	CONSTRAINT `order_line_modifiers_id` PRIMARY KEY(`id`),
	CONSTRAINT `order_line_modifiers_branch_id_uidx` UNIQUE(`branch_id`,`id`),
	CONSTRAINT `order_line_modifiers_line_option_uidx` UNIQUE(`branch_id`,`order_line_id`,`external_modifier_option_id`)
);
--> statement-breakpoint
CREATE TABLE `order_lines` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`order_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`type` enum('recipe','item','external_product') NOT NULL,
	`recipe_id` char(36) CHARACTER SET ascii COLLATE ascii_bin,
	`recipe_size_id` char(36) CHARACTER SET ascii COLLATE ascii_bin,
	`item_id` char(36) CHARACTER SET ascii COLLATE ascii_bin,
	`external_product_id` int,
	`external_size_id` int,
	`product_name` varchar(191) NOT NULL,
	`size_name` varchar(100),
	`quantity` decimal(14,3) NOT NULL,
	`unit_price` decimal(12,2) NOT NULL,
	`line_subtotal` decimal(12,2) NOT NULL,
	`total_cost` decimal(30,2) NOT NULL DEFAULT '0',
	`has_stock_deficit` boolean NOT NULL DEFAULT false,
	CONSTRAINT `order_lines_id` PRIMARY KEY(`id`),
	CONSTRAINT `order_lines_branch_id_uidx` UNIQUE(`branch_id`,`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`order_number` varchar(64) NOT NULL,
	`client_request_id` varchar(36) NOT NULL,
	`request_fingerprint` varchar(64) NOT NULL,
	`cashier_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`shift_id` char(36) CHARACTER SET ascii COLLATE ascii_bin,
	`subtotal` decimal(12,2) NOT NULL,
	`discount_type` enum('percent','fixed'),
	`discount_value` decimal(12,2),
	`discount_amount` decimal(12,2) NOT NULL DEFAULT '0',
	`total` decimal(12,2) NOT NULL,
	`cash_received` decimal(12,2) NOT NULL,
	`change_amount` decimal(12,2) NOT NULL,
	`total_cost` decimal(30,2) NOT NULL DEFAULT '0',
	`is_negative_stock` boolean NOT NULL DEFAULT false,
	`is_admin_sale` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_branch_id_uidx` UNIQUE(`branch_id`,`id`),
	CONSTRAINT `orders_orderNumber_branch_uidx` UNIQUE(`branch_id`,`order_number`),
	CONSTRAINT `orders_clientRequestId_branch_uidx` UNIQUE(`branch_id`,`client_request_id`)
);
--> statement-breakpoint
CREATE TABLE `preparation_allocations` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`preparation_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`ingredient_item_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`ingredient_item_name` varchar(191) NOT NULL,
	`quantity` decimal(14,3) NOT NULL,
	`unit_cost` decimal(16,6) NOT NULL,
	`source_batch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	CONSTRAINT `preparation_allocations_id` PRIMARY KEY(`id`),
	CONSTRAINT `preparation_allocations_branch_id_uidx` UNIQUE(`branch_id`,`id`)
);
--> statement-breakpoint
CREATE TABLE `preparations` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`recipe_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`recipe_name` varchar(191) NOT NULL,
	`output_item_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`output_item_name` varchar(191) NOT NULL,
	`produced_quantity` decimal(14,3) NOT NULL,
	`total_cost` decimal(30,2) NOT NULL,
	`unit_cost` decimal(16,6) NOT NULL,
	`output_batch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin,
	`prepared_by` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`notes` text,
	`occurred_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `preparations_id` PRIMARY KEY(`id`),
	CONSTRAINT `preparations_branch_id_uidx` UNIQUE(`branch_id`,`id`),
	CONSTRAINT `preparations_output_batch_uidx` UNIQUE(`branch_id`,`output_batch_id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_invoices` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`supplier_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`invoice_number` varchar(100),
	`purchased_at` date NOT NULL,
	`notes` text,
	`total_amount` decimal(12,2) NOT NULL,
	`paid_amount` decimal(12,2) NOT NULL,
	`created_by` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`client_request_id` varchar(36) NOT NULL,
	`request_fingerprint` varchar(64) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `purchase_invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `purchase_invoices_branch_id_uidx` UNIQUE(`branch_id`,`id`),
	CONSTRAINT `purchase_invoices_supplier_number_uidx` UNIQUE(`branch_id`,`supplier_id`,`invoice_number`),
	CONSTRAINT `purchase_invoices_client_request_uidx` UNIQUE(`branch_id`,`client_request_id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_lines` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`invoice_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`item_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`quantity` decimal(14,3) NOT NULL,
	`unit_mode` enum('stock','purchase') NOT NULL,
	`stock_quantity` decimal(14,3) NOT NULL,
	`unit_price` decimal(12,2) NOT NULL,
	`unit_cost` decimal(16,6) NOT NULL,
	`line_total` decimal(12,2) NOT NULL,
	CONSTRAINT `purchase_lines_id` PRIMARY KEY(`id`),
	CONSTRAINT `purchase_lines_branch_id_uidx` UNIQUE(`branch_id`,`id`)
);
--> statement-breakpoint
CREATE TABLE `recipe_ingredients` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`recipe_size_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`item_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`quantity` decimal(14,3) NOT NULL,
	CONSTRAINT `recipe_ingredients_id` PRIMARY KEY(`id`),
	CONSTRAINT `recipe_ingredients_branch_id_uidx` UNIQUE(`branch_id`,`id`),
	CONSTRAINT `recipe_ingredients_size_item_uidx` UNIQUE(`branch_id`,`recipe_size_id`,`item_id`)
);
--> statement-breakpoint
CREATE TABLE `recipe_sizes` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`recipe_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`name` varchar(100) NOT NULL,
	`selling_price` decimal(12,2),
	`output_quantity` decimal(14,3),
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `recipe_sizes_id` PRIMARY KEY(`id`),
	CONSTRAINT `recipe_sizes_branch_id_uidx` UNIQUE(`branch_id`,`id`),
	CONSTRAINT `recipe_sizes_recipe_name_uidx` UNIQUE(`branch_id`,`recipe_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `recipes` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`name` varchar(191) NOT NULL,
	`type` enum('product','prepared') NOT NULL,
	`category_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`output_item_id` char(36) CHARACTER SET ascii COLLATE ascii_bin,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `recipes_id` PRIMARY KEY(`id`),
	CONSTRAINT `recipes_branch_id_uidx` UNIQUE(`branch_id`,`id`),
	CONSTRAINT `recipes_output_item_id_uidx` UNIQUE(`branch_id`,`output_item_id`)
);
--> statement-breakpoint
CREATE TABLE `refund_line_allocations` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`refund_line_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`order_line_allocation_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`item_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`quantity` decimal(14,3) NOT NULL,
	`unit_cost` decimal(16,6) NOT NULL,
	`returned_batch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin,
	CONSTRAINT `refund_line_allocations_id` PRIMARY KEY(`id`),
	CONSTRAINT `refund_line_allocations_branch_id_uidx` UNIQUE(`branch_id`,`id`),
	CONSTRAINT `refund_alloc_quantity_positive_chk` CHECK(`refund_line_allocations`.`quantity` > 0),
	CONSTRAINT `refund_alloc_cost_nonnegative_chk` CHECK(`refund_line_allocations`.`unit_cost` >= 0)
);
--> statement-breakpoint
CREATE TABLE `refund_lines` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`refund_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`order_line_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`type` enum('recipe','item','external_product') NOT NULL,
	`product_name` varchar(191) NOT NULL,
	`size_name` varchar(100),
	`quantity` decimal(14,3) NOT NULL,
	`unit_price` decimal(12,2) NOT NULL,
	`refund_amount` decimal(12,2) NOT NULL,
	`gross_amount` decimal(12,2) NOT NULL,
	`stock_action` enum('return_to_stock','not_returnable'),
	`returned_cost` decimal(30,2) NOT NULL DEFAULT '0',
	CONSTRAINT `refund_lines_id` PRIMARY KEY(`id`),
	CONSTRAINT `refund_lines_branch_id_uidx` UNIQUE(`branch_id`,`id`),
	CONSTRAINT `refund_lines_quantity_positive_chk` CHECK(`refund_lines`.`quantity` > 0),
	CONSTRAINT `refund_lines_amount_nonnegative_chk` CHECK(`refund_lines`.`refund_amount` >= 0),
	CONSTRAINT `refund_lines_gross_nonnegative_chk` CHECK(`refund_lines`.`gross_amount` >= 0),
	CONSTRAINT `refund_lines_cost_nonnegative_chk` CHECK(`refund_lines`.`returned_cost` >= 0),
	CONSTRAINT `refund_lines_action_type_chk` CHECK(((`refund_lines`.`type` IN ('item', 'external_product') AND `refund_lines`.`stock_action` IS NOT NULL) OR (`refund_lines`.`type` = 'recipe' AND `refund_lines`.`stock_action` IS NULL)))
);
--> statement-breakpoint
CREATE TABLE `refunds` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`client_request_id` varchar(36) NOT NULL,
	`request_fingerprint` varchar(64) NOT NULL,
	`order_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`shift_id` char(36) CHARACTER SET ascii COLLATE ascii_bin,
	`cashier_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`reason` varchar(500) NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`total_cost_returned` decimal(30,2) NOT NULL DEFAULT '0',
	`is_admin_refund` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `refunds_id` PRIMARY KEY(`id`),
	CONSTRAINT `refunds_branch_id_uidx` UNIQUE(`branch_id`,`id`),
	CONSTRAINT `refunds_clientRequestId_branch_uidx` UNIQUE(`branch_id`,`client_request_id`),
	CONSTRAINT `refunds_amount_positive_chk` CHECK(`refunds`.`amount` >= 0),
	CONSTRAINT `refunds_reason_nonblank_chk` CHECK(CHAR_LENGTH(TRIM(`refunds`.`reason`)) > 0),
	CONSTRAINT `refunds_cost_nonnegative_chk` CHECK(`refunds`.`total_cost_returned` >= 0)
);
--> statement-breakpoint
CREATE TABLE `salary_adjustments` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`employee_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`type` enum('bonus','deduction') NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`entry_date` date NOT NULL,
	`note` varchar(500),
	`recorded_by` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `salary_adjustments_id` PRIMARY KEY(`id`),
	CONSTRAINT `salary_adjustments_branch_id_uidx` UNIQUE(`branch_id`,`id`),
	CONSTRAINT `salary_adjustments_amount_positive_chk` CHECK(`salary_adjustments`.`amount` > 0)
);
--> statement-breakpoint
CREATE TABLE `salary_advances` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`employee_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`entry_date` date NOT NULL,
	`note` varchar(500),
	`recorded_by` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `salary_advances_id` PRIMARY KEY(`id`),
	CONSTRAINT `salary_advances_branch_id_uidx` UNIQUE(`branch_id`,`id`),
	CONSTRAINT `salary_advances_amount_positive_chk` CHECK(`salary_advances`.`amount` > 0)
);
--> statement-breakpoint
CREATE TABLE `salary_payments` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`employee_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`period_month` date NOT NULL,
	`base_pay` decimal(12,2) NOT NULL,
	`bonuses` decimal(12,2) NOT NULL,
	`deductions` decimal(12,2) NOT NULL,
	`advances` decimal(12,2) NOT NULL,
	`net_pay` decimal(12,2) NOT NULL,
	`paid_by` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`paid_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `salary_payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `salary_payments_branch_id_uidx` UNIQUE(`branch_id`,`id`),
	CONSTRAINT `salary_payments_employee_month_uidx` UNIQUE(`branch_id`,`employee_id`,`period_month`),
	CONSTRAINT `salary_payments_amounts_nonnegative_chk` CHECK(`salary_payments`.`base_pay` >= 0 AND `salary_payments`.`bonuses` >= 0 AND `salary_payments`.`deductions` >= 0 AND `salary_payments`.`advances` >= 0 AND `salary_payments`.`net_pay` >= 0)
);
--> statement-breakpoint
CREATE TABLE `shift_events` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`shift_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`action` enum('open','close','admin_close','auto_close','reopen','correction') NOT NULL,
	`actor_user_id` char(36) CHARACTER SET ascii COLLATE ascii_bin,
	`note` varchar(500),
	`opening_float` decimal(12,2),
	`actual_cash` decimal(12,2),
	`expected_cash` decimal(12,2),
	`over_short` decimal(12,2),
	`occurred_at` timestamp NOT NULL,
	CONSTRAINT `shift_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `shift_events_branch_id_uidx` UNIQUE(`branch_id`,`id`)
);
--> statement-breakpoint
CREATE TABLE `shifts` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`cashier_user_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`employee_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`status` enum('open','closed') NOT NULL DEFAULT 'open',
	`open_slot` int,
	`opening_float` decimal(12,2) NOT NULL,
	`opened_at` timestamp NOT NULL,
	`closed_at` timestamp,
	`closed_by_user_id` char(36) CHARACTER SET ascii COLLATE ascii_bin,
	`actual_cash` decimal(12,2),
	`expected_cash` decimal(12,2),
	`over_short` decimal(12,2),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `shifts_id` PRIMARY KEY(`id`),
	CONSTRAINT `shifts_branch_id_uidx` UNIQUE(`branch_id`,`id`),
	CONSTRAINT `shifts_open_slot_uidx` UNIQUE(`branch_id`,`open_slot`)
);
--> statement-breakpoint
CREATE TABLE `stock_batches` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`item_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`warehouse` enum('main','cafe') NOT NULL,
	`initial_quantity` decimal(14,3) NOT NULL,
	`remaining_quantity` decimal(14,3) NOT NULL,
	`unit_cost` decimal(16,6) NOT NULL,
	`received_at` timestamp NOT NULL,
	`source_type` varchar(50) NOT NULL,
	`source_id` char(36) CHARACTER SET ascii COLLATE ascii_bin,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stock_batches_id` PRIMARY KEY(`id`),
	CONSTRAINT `stock_batches_branch_id_uidx` UNIQUE(`branch_id`,`id`)
);
--> statement-breakpoint
CREATE TABLE `stock_deficit_allocations` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`deficit_movement_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`batch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`quantity` decimal(14,3) NOT NULL,
	`unit_cost` decimal(16,6) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stock_deficit_allocations_id` PRIMARY KEY(`id`),
	CONSTRAINT `stock_deficit_allocations_branch_id_uidx` UNIQUE(`branch_id`,`id`)
);
--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`item_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`warehouse` enum('main','cafe') NOT NULL,
	`batch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin,
	`movement_type` varchar(50) NOT NULL,
	`quantity` decimal(14,3) NOT NULL,
	`unit_cost` decimal(16,6) NOT NULL,
	`reference_type` varchar(50),
	`reference_id` char(36) CHARACTER SET ascii COLLATE ascii_bin,
	`notes` varchar(255),
	`occurred_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stock_movements_id` PRIMARY KEY(`id`),
	CONSTRAINT `stock_movements_branch_id_uidx` UNIQUE(`branch_id`,`id`)
);
--> statement-breakpoint
CREATE TABLE `stocktake_lines` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`stocktake_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`item_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`recorded_quantity` decimal(14,3) NOT NULL,
	`counted_quantity` decimal(14,3),
	CONSTRAINT `stocktake_lines_id` PRIMARY KEY(`id`),
	CONSTRAINT `stocktake_lines_branch_id_uidx` UNIQUE(`branch_id`,`id`),
	CONSTRAINT `stocktake_lines_document_item_uidx` UNIQUE(`branch_id`,`stocktake_id`,`item_id`)
);
--> statement-breakpoint
CREATE TABLE `stocktakes` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`kind` enum('stocktake','manual') NOT NULL DEFAULT 'stocktake',
	`warehouse` enum('main','cafe') NOT NULL,
	`category_id` char(36) CHARACTER SET ascii COLLATE ascii_bin,
	`status` enum('draft','confirmed') NOT NULL DEFAULT 'draft',
	`note` varchar(500),
	`created_by` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`confirmed_at` timestamp,
	CONSTRAINT `stocktakes_id` PRIMARY KEY(`id`),
	CONSTRAINT `stocktakes_branch_id_uidx` UNIQUE(`branch_id`,`id`)
);
--> statement-breakpoint
CREATE TABLE `supplier_payments` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`supplier_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`purchase_invoice_id` char(36) CHARACTER SET ascii COLLATE ascii_bin,
	`amount` decimal(12,2) NOT NULL,
	`paid_at` date NOT NULL,
	`notes` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `supplier_payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `supplier_payments_branch_id_uidx` UNIQUE(`branch_id`,`id`)
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`name` varchar(191) NOT NULL,
	`phone` varchar(50),
	`address` varchar(255),
	`notes` text,
	`opening_balance` decimal(12,2) NOT NULL DEFAULT '0',
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `suppliers_id` PRIMARY KEY(`id`),
	CONSTRAINT `suppliers_branch_id_uidx` UNIQUE(`branch_id`,`id`)
);
--> statement-breakpoint
CREATE TABLE `sync_outbox` (
	`seq` bigint unsigned AUTO_INCREMENT NOT NULL,
	`table_name` varchar(64) NOT NULL,
	`op` enum('upsert','delete') NOT NULL,
	`pk` json NOT NULL,
	`row_json` json,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `sync_outbox_seq` PRIMARY KEY(`seq`)
);
--> statement-breakpoint
CREATE TABLE `sync_state` (
	`id` tinyint NOT NULL,
	`last_uploaded_seq` bigint unsigned NOT NULL DEFAULT 0,
	`last_success_at` timestamp(3),
	`last_error` text,
	`last_attempt_at` timestamp(3),
	CONSTRAINT `sync_state_id` PRIMARY KEY(`id`),
	CONSTRAINT `sync_state_singleton_chk` CHECK(`sync_state`.`id` = 1)
);
--> statement-breakpoint
CREATE TABLE `transfer_lines` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`transfer_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`item_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`quantity` decimal(14,3) NOT NULL,
	`unit_cost` decimal(16,6) NOT NULL,
	`source_batch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`cafe_batch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	CONSTRAINT `transfer_lines_id` PRIMARY KEY(`id`),
	CONSTRAINT `transfer_lines_branch_id_uidx` UNIQUE(`branch_id`,`id`),
	CONSTRAINT `transfer_lines_cafe_batch_uidx` UNIQUE(`branch_id`,`cafe_batch_id`)
);
--> statement-breakpoint
CREATE TABLE `transfer_request_lines` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`request_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`item_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`quantity` decimal(14,3) NOT NULL,
	CONSTRAINT `transfer_request_lines_id` PRIMARY KEY(`id`),
	CONSTRAINT `transfer_request_lines_branch_id_uidx` UNIQUE(`branch_id`,`id`),
	CONSTRAINT `transfer_request_lines_request_item_uidx` UNIQUE(`branch_id`,`request_id`,`item_id`)
);
--> statement-breakpoint
CREATE TABLE `transfer_requests` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`requested_by` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`shift_id` char(36) CHARACTER SET ascii COLLATE ascii_bin,
	`notes` text,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`reviewed_by` char(36) CHARACTER SET ascii COLLATE ascii_bin,
	`rejection_reason` varchar(500),
	`reviewed_at` timestamp,
	`client_request_id` varchar(36) NOT NULL,
	`request_fingerprint` varchar(64) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `transfer_requests_id` PRIMARY KEY(`id`),
	CONSTRAINT `transfer_requests_branch_id_uidx` UNIQUE(`branch_id`,`id`),
	CONSTRAINT `transfer_requests_client_request_uidx` UNIQUE(`branch_id`,`client_request_id`)
);
--> statement-breakpoint
CREATE TABLE `transfers` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`request_id` char(36) CHARACTER SET ascii COLLATE ascii_bin,
	`purchase_invoice_id` char(36) CHARACTER SET ascii COLLATE ascii_bin,
	`created_by` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`approved_by` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `transfers_id` PRIMARY KEY(`id`),
	CONSTRAINT `transfers_branch_id_uidx` UNIQUE(`branch_id`,`id`),
	CONSTRAINT `transfers_request_id_uidx` UNIQUE(`branch_id`,`request_id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin,
	`employee_id` char(36) CHARACTER SET ascii COLLATE ascii_bin,
	`name` varchar(191) NOT NULL,
	`username` varchar(100) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`token_version` int NOT NULL DEFAULT 0,
	`role` enum('admin','cashier') NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`is_super_admin` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_branch_id_uidx` UNIQUE(`branch_id`,`id`),
	CONSTRAINT `users_employee_id_uidx` UNIQUE(`employee_id`),
	CONSTRAINT `users_cashier_username_branch_uidx` UNIQUE(`role`,`branch_id`,`username`),
	CONSTRAINT `users_admin_username_uidx` UNIQUE((CASE WHEN `role` = 'admin' THEN `username` ELSE NULL END)),
	CONSTRAINT `users_role_branch_chk` CHECK((`users`.`role` = 'admin' AND `users`.`branch_id` IS NULL) OR (`users`.`role` = 'cashier' AND `users`.`branch_id` IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `waste_allocations` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`waste_entry_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`item_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`item_name` varchar(191) NOT NULL,
	`batch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin,
	`stock_movement_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`quantity` decimal(14,3) NOT NULL,
	`unit_cost` decimal(16,6) NOT NULL,
	CONSTRAINT `waste_allocations_id` PRIMARY KEY(`id`),
	CONSTRAINT `waste_allocations_branch_id_uidx` UNIQUE(`branch_id`,`id`),
	CONSTRAINT `waste_allocations_movement_uidx` UNIQUE(`branch_id`,`stock_movement_id`),
	CONSTRAINT `waste_allocations_quantity_positive_chk` CHECK(`waste_allocations`.`quantity` > 0),
	CONSTRAINT `waste_allocations_cost_nonnegative_chk` CHECK(`waste_allocations`.`unit_cost` >= 0)
);
--> statement-breakpoint
CREATE TABLE `waste_entries` (
	`branch_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`client_request_id` varchar(36),
	`request_fingerprint` varchar(64),
	`shift_id` char(36) CHARACTER SET ascii COLLATE ascii_bin,
	`warehouse` enum('main','cafe') NOT NULL,
	`target_type` enum('item','recipe','external_product'),
	`item_id` char(36) CHARACTER SET ascii COLLATE ascii_bin,
	`recipe_id` char(36) CHARACTER SET ascii COLLATE ascii_bin,
	`recipe_size_id` char(36) CHARACTER SET ascii COLLATE ascii_bin,
	`external_product_id` int,
	`external_size_id` int,
	`target_name` varchar(191),
	`size_name` varchar(100),
	`quantity` decimal(14,3) NOT NULL,
	`reason` varchar(500) NOT NULL,
	`reason_code` enum('expired','damaged','preparation_mistake','spill','other'),
	`note` varchar(500),
	`total_cost` decimal(30,2) NOT NULL,
	`recorded_by` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`refund_line_id` char(36) CHARACTER SET ascii COLLATE ascii_bin,
	`occurred_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `waste_entries_id` PRIMARY KEY(`id`),
	CONSTRAINT `waste_entries_branch_id_uidx` UNIQUE(`branch_id`,`id`),
	CONSTRAINT `waste_entries_clientRequestId_branch_uidx` UNIQUE(`branch_id`,`client_request_id`),
	CONSTRAINT `waste_entries_refundLineId_branch_uidx` UNIQUE(`branch_id`,`refund_line_id`),
	CONSTRAINT `waste_entries_quantity_positive_chk` CHECK(`waste_entries`.`quantity` > 0),
	CONSTRAINT `waste_entries_cost_nonnegative_chk` CHECK(`waste_entries`.`total_cost` >= 0),
	CONSTRAINT `waste_entries_reason_nonblank_chk` CHECK(CHAR_LENGTH(TRIM(`waste_entries`.`reason`)) > 0),
	CONSTRAINT `waste_entries_direct_shape_chk` CHECK(`waste_entries`.`refund_line_id` IS NOT NULL OR (
        `waste_entries`.`client_request_id` IS NOT NULL
        AND `waste_entries`.`reason_code` IS NOT NULL
        AND (
          (
            `waste_entries`.`target_type` = 'item'
            AND `waste_entries`.`item_id` IS NOT NULL
            AND `waste_entries`.`recipe_id` IS NULL
            AND `waste_entries`.`recipe_size_id` IS NULL
            AND `waste_entries`.`external_product_id` IS NULL
            AND `waste_entries`.`external_size_id` IS NULL
          )
          OR
          (
            `waste_entries`.`target_type` = 'recipe'
            AND `waste_entries`.`item_id` IS NULL
            AND `waste_entries`.`recipe_id` IS NOT NULL
            AND `waste_entries`.`recipe_size_id` IS NOT NULL
            AND `waste_entries`.`external_product_id` IS NULL
            AND `waste_entries`.`external_size_id` IS NULL
          )
          OR
          (
            `waste_entries`.`target_type` = 'external_product'
            AND `waste_entries`.`item_id` IS NULL
            AND `waste_entries`.`recipe_id` IS NULL
            AND `waste_entries`.`recipe_size_id` IS NULL
            AND `waste_entries`.`external_product_id` IS NOT NULL
          )
        )
      ))
);
--> statement-breakpoint
ALTER TABLE `admin_branches` ADD CONSTRAINT `admin_branches_admin_user_id_users_id_fk` FOREIGN KEY (`admin_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `admin_branches` ADD CONSTRAINT `admin_branches_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `categories` ADD CONSTRAINT `categories_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `categories` ADD CONSTRAINT `categories_parent_id_categories_id_fk` FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `categories` ADD CONSTRAINT `categories_parentId_br_fk` FOREIGN KEY (`branch_id`,`parent_id`) REFERENCES `categories`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `devices` ADD CONSTRAINT `devices_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `employees` ADD CONSTRAINT `employees_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `expense_categories` ADD CONSTRAINT `expense_categories_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_category_id_expense_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `expense_categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_shift_id_shifts_id_fk` FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_recorded_by_users_id_fk` FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_categoryId_br_fk` FOREIGN KEY (`branch_id`,`category_id`) REFERENCES `expense_categories`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_shiftId_br_fk` FOREIGN KEY (`branch_id`,`shift_id`) REFERENCES `shifts`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_catalog_sync` ADD CONSTRAINT `external_catalog_sync_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_categories` ADD CONSTRAINT `external_categories_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_modifier_groups` ADD CONSTRAINT `external_modifier_groups_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_modifier_groups` ADD CONSTRAINT `ext_mod_grp_prod_fk` FOREIGN KEY (`branch_id`,`external_product_id`) REFERENCES `external_products`(`branch_id`,`external_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_modifier_ingredients` ADD CONSTRAINT `external_modifier_ingredients_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_modifier_ingredients` ADD CONSTRAINT `external_modifier_ingredients_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_modifier_ingredients` ADD CONSTRAINT `external_modifier_ingredients_itemId_br_fk` FOREIGN KEY (`branch_id`,`item_id`) REFERENCES `items`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_modifier_ingredients` ADD CONSTRAINT `ext_mod_ing_opt_fk` FOREIGN KEY (`branch_id`,`external_modifier_option_id`) REFERENCES `external_modifier_options`(`branch_id`,`external_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_modifier_options` ADD CONSTRAINT `external_modifier_options_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_modifier_options` ADD CONSTRAINT `ext_mod_opt_grp_fk` FOREIGN KEY (`branch_id`,`external_modifier_group_id`) REFERENCES `external_modifier_groups`(`branch_id`,`external_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_orders_cache` ADD CONSTRAINT `external_orders_cache_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_product_ingredients` ADD CONSTRAINT `external_product_ingredients_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_product_ingredients` ADD CONSTRAINT `external_product_ingredients_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_product_ingredients` ADD CONSTRAINT `external_product_ingredients_itemId_br_fk` FOREIGN KEY (`branch_id`,`item_id`) REFERENCES `items`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_product_ingredients` ADD CONSTRAINT `ext_prod_ing_prod_fk` FOREIGN KEY (`branch_id`,`external_product_id`) REFERENCES `external_products`(`branch_id`,`external_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_product_sizes` ADD CONSTRAINT `external_product_sizes_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_product_sizes` ADD CONSTRAINT `ext_size_prod_fk` FOREIGN KEY (`branch_id`,`external_product_id`) REFERENCES `external_products`(`branch_id`,`external_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_products` ADD CONSTRAINT `external_products_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_products` ADD CONSTRAINT `ext_prod_cat_fk` FOREIGN KEY (`branch_id`,`external_category_id`) REFERENCES `external_categories`(`branch_id`,`external_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_size_ingredients` ADD CONSTRAINT `external_size_ingredients_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_size_ingredients` ADD CONSTRAINT `external_size_ingredients_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_size_ingredients` ADD CONSTRAINT `external_size_ingredients_itemId_br_fk` FOREIGN KEY (`branch_id`,`item_id`) REFERENCES `items`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `external_size_ingredients` ADD CONSTRAINT `ext_size_ing_size_fk` FOREIGN KEY (`branch_id`,`external_size_id`) REFERENCES `external_product_sizes`(`branch_id`,`external_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `items` ADD CONSTRAINT `items_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `items` ADD CONSTRAINT `items_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `items` ADD CONSTRAINT `items_categoryId_br_fk` FOREIGN KEY (`branch_id`,`category_id`) REFERENCES `categories`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `link_codes` ADD CONSTRAINT `link_codes_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_line_allocations` ADD CONSTRAINT `order_line_allocations_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_line_allocations` ADD CONSTRAINT `order_line_allocations_order_line_id_order_lines_id_fk` FOREIGN KEY (`order_line_id`) REFERENCES `order_lines`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_line_allocations` ADD CONSTRAINT `order_line_allocations_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_line_allocations` ADD CONSTRAINT `order_line_allocations_batch_id_stock_batches_id_fk` FOREIGN KEY (`batch_id`) REFERENCES `stock_batches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_line_allocations` ADD CONSTRAINT `order_line_allocations_stock_movement_id_stock_movements_id_fk` FOREIGN KEY (`stock_movement_id`) REFERENCES `stock_movements`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_line_allocations` ADD CONSTRAINT `order_line_allocations_orderLineId_br_fk` FOREIGN KEY (`branch_id`,`order_line_id`) REFERENCES `order_lines`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_line_allocations` ADD CONSTRAINT `order_line_allocations_itemId_br_fk` FOREIGN KEY (`branch_id`,`item_id`) REFERENCES `items`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_line_allocations` ADD CONSTRAINT `order_line_allocations_batchId_br_fk` FOREIGN KEY (`branch_id`,`batch_id`) REFERENCES `stock_batches`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_line_allocations` ADD CONSTRAINT `order_line_allocations_stockMovementId_br_fk` FOREIGN KEY (`branch_id`,`stock_movement_id`) REFERENCES `stock_movements`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_line_modifiers` ADD CONSTRAINT `order_line_modifiers_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_line_modifiers` ADD CONSTRAINT `order_line_modifiers_order_line_id_order_lines_id_fk` FOREIGN KEY (`order_line_id`) REFERENCES `order_lines`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_line_modifiers` ADD CONSTRAINT `order_line_modifiers_orderLineId_br_fk` FOREIGN KEY (`branch_id`,`order_line_id`) REFERENCES `order_lines`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_lines` ADD CONSTRAINT `order_lines_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_lines` ADD CONSTRAINT `order_lines_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_lines` ADD CONSTRAINT `order_lines_recipe_id_recipes_id_fk` FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_lines` ADD CONSTRAINT `order_lines_recipe_size_id_recipe_sizes_id_fk` FOREIGN KEY (`recipe_size_id`) REFERENCES `recipe_sizes`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_lines` ADD CONSTRAINT `order_lines_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_lines` ADD CONSTRAINT `order_lines_orderId_br_fk` FOREIGN KEY (`branch_id`,`order_id`) REFERENCES `orders`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_lines` ADD CONSTRAINT `order_lines_recipeId_br_fk` FOREIGN KEY (`branch_id`,`recipe_id`) REFERENCES `recipes`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_lines` ADD CONSTRAINT `order_lines_itemId_br_fk` FOREIGN KEY (`branch_id`,`item_id`) REFERENCES `items`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_lines` ADD CONSTRAINT `order_lines_externalProductId_br_fk` FOREIGN KEY (`branch_id`,`external_product_id`) REFERENCES `external_products`(`branch_id`,`external_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_lines` ADD CONSTRAINT `order_line_ext_size_fk` FOREIGN KEY (`branch_id`,`external_size_id`) REFERENCES `external_product_sizes`(`branch_id`,`external_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_cashier_id_users_id_fk` FOREIGN KEY (`cashier_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_shift_id_shifts_id_fk` FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_shiftId_br_fk` FOREIGN KEY (`branch_id`,`shift_id`) REFERENCES `shifts`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `preparation_allocations` ADD CONSTRAINT `preparation_allocations_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `preparation_allocations` ADD CONSTRAINT `preparation_allocations_preparation_id_preparations_id_fk` FOREIGN KEY (`preparation_id`) REFERENCES `preparations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `preparation_allocations` ADD CONSTRAINT `preparation_allocations_ingredient_item_id_items_id_fk` FOREIGN KEY (`ingredient_item_id`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `preparation_allocations` ADD CONSTRAINT `preparation_allocations_source_batch_id_stock_batches_id_fk` FOREIGN KEY (`source_batch_id`) REFERENCES `stock_batches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `preparation_allocations` ADD CONSTRAINT `preparation_allocations_preparationId_br_fk` FOREIGN KEY (`branch_id`,`preparation_id`) REFERENCES `preparations`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `preparation_allocations` ADD CONSTRAINT `preparation_allocations_ingredientItemId_br_fk` FOREIGN KEY (`branch_id`,`ingredient_item_id`) REFERENCES `items`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `preparation_allocations` ADD CONSTRAINT `preparation_allocations_sourceBatchId_br_fk` FOREIGN KEY (`branch_id`,`source_batch_id`) REFERENCES `stock_batches`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `preparations` ADD CONSTRAINT `preparations_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `preparations` ADD CONSTRAINT `preparations_recipe_id_recipes_id_fk` FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `preparations` ADD CONSTRAINT `preparations_output_item_id_items_id_fk` FOREIGN KEY (`output_item_id`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `preparations` ADD CONSTRAINT `preparations_output_batch_id_stock_batches_id_fk` FOREIGN KEY (`output_batch_id`) REFERENCES `stock_batches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `preparations` ADD CONSTRAINT `preparations_prepared_by_users_id_fk` FOREIGN KEY (`prepared_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `preparations` ADD CONSTRAINT `preparations_recipeId_br_fk` FOREIGN KEY (`branch_id`,`recipe_id`) REFERENCES `recipes`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `preparations` ADD CONSTRAINT `preparations_outputItemId_br_fk` FOREIGN KEY (`branch_id`,`output_item_id`) REFERENCES `items`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `preparations` ADD CONSTRAINT `preparations_outputBatchId_br_fk` FOREIGN KEY (`branch_id`,`output_batch_id`) REFERENCES `stock_batches`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_invoices` ADD CONSTRAINT `purchase_invoices_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_invoices` ADD CONSTRAINT `purchase_invoices_supplier_id_suppliers_id_fk` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_invoices` ADD CONSTRAINT `purchase_invoices_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_invoices` ADD CONSTRAINT `purchase_invoices_supplierId_br_fk` FOREIGN KEY (`branch_id`,`supplier_id`) REFERENCES `suppliers`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_lines` ADD CONSTRAINT `purchase_lines_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_lines` ADD CONSTRAINT `purchase_lines_invoice_id_purchase_invoices_id_fk` FOREIGN KEY (`invoice_id`) REFERENCES `purchase_invoices`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_lines` ADD CONSTRAINT `purchase_lines_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_lines` ADD CONSTRAINT `purchase_lines_invoiceId_br_fk` FOREIGN KEY (`branch_id`,`invoice_id`) REFERENCES `purchase_invoices`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_lines` ADD CONSTRAINT `purchase_lines_itemId_br_fk` FOREIGN KEY (`branch_id`,`item_id`) REFERENCES `items`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipe_ingredients` ADD CONSTRAINT `recipe_ingredients_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipe_ingredients` ADD CONSTRAINT `recipe_ingredients_recipe_size_id_recipe_sizes_id_fk` FOREIGN KEY (`recipe_size_id`) REFERENCES `recipe_sizes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipe_ingredients` ADD CONSTRAINT `recipe_ingredients_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipe_ingredients` ADD CONSTRAINT `recipe_ingredients_recipeSizeId_br_fk` FOREIGN KEY (`branch_id`,`recipe_size_id`) REFERENCES `recipe_sizes`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipe_ingredients` ADD CONSTRAINT `recipe_ingredients_itemId_br_fk` FOREIGN KEY (`branch_id`,`item_id`) REFERENCES `items`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipe_sizes` ADD CONSTRAINT `recipe_sizes_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipe_sizes` ADD CONSTRAINT `recipe_sizes_recipe_id_recipes_id_fk` FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipe_sizes` ADD CONSTRAINT `recipe_sizes_recipeId_br_fk` FOREIGN KEY (`branch_id`,`recipe_id`) REFERENCES `recipes`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipes` ADD CONSTRAINT `recipes_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipes` ADD CONSTRAINT `recipes_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipes` ADD CONSTRAINT `recipes_output_item_id_items_id_fk` FOREIGN KEY (`output_item_id`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipes` ADD CONSTRAINT `recipes_categoryId_br_fk` FOREIGN KEY (`branch_id`,`category_id`) REFERENCES `categories`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `recipes` ADD CONSTRAINT `recipes_outputItemId_br_fk` FOREIGN KEY (`branch_id`,`output_item_id`) REFERENCES `items`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refund_line_allocations` ADD CONSTRAINT `refund_line_allocations_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refund_line_allocations` ADD CONSTRAINT `refund_line_allocations_refund_line_id_refund_lines_id_fk` FOREIGN KEY (`refund_line_id`) REFERENCES `refund_lines`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refund_line_allocations` ADD CONSTRAINT `refund_line_allocations_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refund_line_allocations` ADD CONSTRAINT `refund_line_allocations_refundLineId_br_fk` FOREIGN KEY (`branch_id`,`refund_line_id`) REFERENCES `refund_lines`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refund_line_allocations` ADD CONSTRAINT `refund_line_allocations_itemId_br_fk` FOREIGN KEY (`branch_id`,`item_id`) REFERENCES `items`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refund_line_allocations` ADD CONSTRAINT `refund_alloc_order_alloc_fk` FOREIGN KEY (`branch_id`,`order_line_allocation_id`) REFERENCES `order_line_allocations`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refund_line_allocations` ADD CONSTRAINT `refund_alloc_batch_fk` FOREIGN KEY (`branch_id`,`returned_batch_id`) REFERENCES `stock_batches`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refund_lines` ADD CONSTRAINT `refund_lines_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refund_lines` ADD CONSTRAINT `refund_lines_refund_id_refunds_id_fk` FOREIGN KEY (`refund_id`) REFERENCES `refunds`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refund_lines` ADD CONSTRAINT `refund_lines_order_line_id_order_lines_id_fk` FOREIGN KEY (`order_line_id`) REFERENCES `order_lines`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refund_lines` ADD CONSTRAINT `refund_lines_refundId_br_fk` FOREIGN KEY (`branch_id`,`refund_id`) REFERENCES `refunds`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refund_lines` ADD CONSTRAINT `refund_lines_orderLineId_br_fk` FOREIGN KEY (`branch_id`,`order_line_id`) REFERENCES `order_lines`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_shift_id_shifts_id_fk` FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_cashier_id_users_id_fk` FOREIGN KEY (`cashier_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_orderId_br_fk` FOREIGN KEY (`branch_id`,`order_id`) REFERENCES `orders`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_shiftId_br_fk` FOREIGN KEY (`branch_id`,`shift_id`) REFERENCES `shifts`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `salary_adjustments` ADD CONSTRAINT `salary_adjustments_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `salary_adjustments` ADD CONSTRAINT `salary_adjustments_employee_id_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `salary_adjustments` ADD CONSTRAINT `salary_adjustments_recorded_by_users_id_fk` FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `salary_adjustments` ADD CONSTRAINT `salary_adjustments_employeeId_br_fk` FOREIGN KEY (`branch_id`,`employee_id`) REFERENCES `employees`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `salary_advances` ADD CONSTRAINT `salary_advances_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `salary_advances` ADD CONSTRAINT `salary_advances_employee_id_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `salary_advances` ADD CONSTRAINT `salary_advances_recorded_by_users_id_fk` FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `salary_advances` ADD CONSTRAINT `salary_advances_employeeId_br_fk` FOREIGN KEY (`branch_id`,`employee_id`) REFERENCES `employees`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `salary_payments` ADD CONSTRAINT `salary_payments_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `salary_payments` ADD CONSTRAINT `salary_payments_employee_id_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `salary_payments` ADD CONSTRAINT `salary_payments_paid_by_users_id_fk` FOREIGN KEY (`paid_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `salary_payments` ADD CONSTRAINT `salary_payments_employeeId_br_fk` FOREIGN KEY (`branch_id`,`employee_id`) REFERENCES `employees`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shift_events` ADD CONSTRAINT `shift_events_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shift_events` ADD CONSTRAINT `shift_events_shift_id_shifts_id_fk` FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shift_events` ADD CONSTRAINT `shift_events_actor_user_id_users_id_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shift_events` ADD CONSTRAINT `shift_events_shiftId_br_fk` FOREIGN KEY (`branch_id`,`shift_id`) REFERENCES `shifts`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shifts` ADD CONSTRAINT `shifts_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shifts` ADD CONSTRAINT `shifts_cashier_user_id_users_id_fk` FOREIGN KEY (`cashier_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shifts` ADD CONSTRAINT `shifts_employee_id_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shifts` ADD CONSTRAINT `shifts_closed_by_user_id_users_id_fk` FOREIGN KEY (`closed_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shifts` ADD CONSTRAINT `shifts_employeeId_br_fk` FOREIGN KEY (`branch_id`,`employee_id`) REFERENCES `employees`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_batches` ADD CONSTRAINT `stock_batches_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_batches` ADD CONSTRAINT `stock_batches_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_batches` ADD CONSTRAINT `stock_batches_itemId_br_fk` FOREIGN KEY (`branch_id`,`item_id`) REFERENCES `items`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_deficit_allocations` ADD CONSTRAINT `stock_deficit_allocations_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_deficit_allocations` ADD CONSTRAINT `stock_deficit_movement_fk` FOREIGN KEY (`branch_id`,`deficit_movement_id`) REFERENCES `stock_movements`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_deficit_allocations` ADD CONSTRAINT `stock_deficit_batch_fk` FOREIGN KEY (`branch_id`,`batch_id`) REFERENCES `stock_batches`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_batch_id_stock_batches_id_fk` FOREIGN KEY (`batch_id`) REFERENCES `stock_batches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_itemId_br_fk` FOREIGN KEY (`branch_id`,`item_id`) REFERENCES `items`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_batchId_br_fk` FOREIGN KEY (`branch_id`,`batch_id`) REFERENCES `stock_batches`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stocktake_lines` ADD CONSTRAINT `stocktake_lines_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stocktake_lines` ADD CONSTRAINT `stocktake_lines_stocktake_id_stocktakes_id_fk` FOREIGN KEY (`stocktake_id`) REFERENCES `stocktakes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stocktake_lines` ADD CONSTRAINT `stocktake_lines_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stocktake_lines` ADD CONSTRAINT `stocktake_lines_stocktakeId_br_fk` FOREIGN KEY (`branch_id`,`stocktake_id`) REFERENCES `stocktakes`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stocktake_lines` ADD CONSTRAINT `stocktake_lines_itemId_br_fk` FOREIGN KEY (`branch_id`,`item_id`) REFERENCES `items`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stocktakes` ADD CONSTRAINT `stocktakes_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stocktakes` ADD CONSTRAINT `stocktakes_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stocktakes` ADD CONSTRAINT `stocktakes_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stocktakes` ADD CONSTRAINT `stocktakes_categoryId_br_fk` FOREIGN KEY (`branch_id`,`category_id`) REFERENCES `categories`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplier_payments` ADD CONSTRAINT `supplier_payments_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplier_payments` ADD CONSTRAINT `supplier_payments_supplier_id_suppliers_id_fk` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplier_payments` ADD CONSTRAINT `supplier_payments_purchase_invoice_id_purchase_invoices_id_fk` FOREIGN KEY (`purchase_invoice_id`) REFERENCES `purchase_invoices`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplier_payments` ADD CONSTRAINT `supplier_payments_supplierId_br_fk` FOREIGN KEY (`branch_id`,`supplier_id`) REFERENCES `suppliers`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplier_payments` ADD CONSTRAINT `supplier_payments_purchaseInvoiceId_br_fk` FOREIGN KEY (`branch_id`,`purchase_invoice_id`) REFERENCES `purchase_invoices`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `suppliers` ADD CONSTRAINT `suppliers_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfer_lines` ADD CONSTRAINT `transfer_lines_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfer_lines` ADD CONSTRAINT `transfer_lines_transfer_id_transfers_id_fk` FOREIGN KEY (`transfer_id`) REFERENCES `transfers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfer_lines` ADD CONSTRAINT `transfer_lines_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfer_lines` ADD CONSTRAINT `transfer_lines_source_batch_id_stock_batches_id_fk` FOREIGN KEY (`source_batch_id`) REFERENCES `stock_batches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfer_lines` ADD CONSTRAINT `transfer_lines_cafe_batch_id_stock_batches_id_fk` FOREIGN KEY (`cafe_batch_id`) REFERENCES `stock_batches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfer_lines` ADD CONSTRAINT `transfer_lines_transferId_br_fk` FOREIGN KEY (`branch_id`,`transfer_id`) REFERENCES `transfers`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfer_lines` ADD CONSTRAINT `transfer_lines_itemId_br_fk` FOREIGN KEY (`branch_id`,`item_id`) REFERENCES `items`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfer_lines` ADD CONSTRAINT `transfer_lines_sourceBatchId_br_fk` FOREIGN KEY (`branch_id`,`source_batch_id`) REFERENCES `stock_batches`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfer_lines` ADD CONSTRAINT `transfer_lines_cafeBatchId_br_fk` FOREIGN KEY (`branch_id`,`cafe_batch_id`) REFERENCES `stock_batches`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfer_request_lines` ADD CONSTRAINT `transfer_request_lines_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfer_request_lines` ADD CONSTRAINT `transfer_request_lines_request_id_transfer_requests_id_fk` FOREIGN KEY (`request_id`) REFERENCES `transfer_requests`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfer_request_lines` ADD CONSTRAINT `transfer_request_lines_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfer_request_lines` ADD CONSTRAINT `transfer_request_lines_requestId_br_fk` FOREIGN KEY (`branch_id`,`request_id`) REFERENCES `transfer_requests`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfer_request_lines` ADD CONSTRAINT `transfer_request_lines_itemId_br_fk` FOREIGN KEY (`branch_id`,`item_id`) REFERENCES `items`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfer_requests` ADD CONSTRAINT `transfer_requests_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfer_requests` ADD CONSTRAINT `transfer_requests_requested_by_users_id_fk` FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfer_requests` ADD CONSTRAINT `transfer_requests_shift_id_shifts_id_fk` FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfer_requests` ADD CONSTRAINT `transfer_requests_reviewed_by_users_id_fk` FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfer_requests` ADD CONSTRAINT `transfer_requests_shiftId_br_fk` FOREIGN KEY (`branch_id`,`shift_id`) REFERENCES `shifts`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_request_id_transfer_requests_id_fk` FOREIGN KEY (`request_id`) REFERENCES `transfer_requests`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_purchase_invoice_id_purchase_invoices_id_fk` FOREIGN KEY (`purchase_invoice_id`) REFERENCES `purchase_invoices`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_approved_by_users_id_fk` FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_requestId_br_fk` FOREIGN KEY (`branch_id`,`request_id`) REFERENCES `transfer_requests`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_purchaseInvoiceId_br_fk` FOREIGN KEY (`branch_id`,`purchase_invoice_id`) REFERENCES `purchase_invoices`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_employee_id_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_employeeId_br_fk` FOREIGN KEY (`branch_id`,`employee_id`) REFERENCES `employees`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `waste_allocations` ADD CONSTRAINT `waste_allocations_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `waste_allocations` ADD CONSTRAINT `waste_allocations_waste_entry_id_waste_entries_id_fk` FOREIGN KEY (`waste_entry_id`) REFERENCES `waste_entries`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `waste_allocations` ADD CONSTRAINT `waste_allocations_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `waste_allocations` ADD CONSTRAINT `waste_allocations_batch_id_stock_batches_id_fk` FOREIGN KEY (`batch_id`) REFERENCES `stock_batches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `waste_allocations` ADD CONSTRAINT `waste_allocations_stock_movement_id_stock_movements_id_fk` FOREIGN KEY (`stock_movement_id`) REFERENCES `stock_movements`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `waste_allocations` ADD CONSTRAINT `waste_allocations_wasteEntryId_br_fk` FOREIGN KEY (`branch_id`,`waste_entry_id`) REFERENCES `waste_entries`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `waste_allocations` ADD CONSTRAINT `waste_allocations_itemId_br_fk` FOREIGN KEY (`branch_id`,`item_id`) REFERENCES `items`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `waste_allocations` ADD CONSTRAINT `waste_allocations_batchId_br_fk` FOREIGN KEY (`branch_id`,`batch_id`) REFERENCES `stock_batches`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `waste_allocations` ADD CONSTRAINT `waste_allocations_stockMovementId_br_fk` FOREIGN KEY (`branch_id`,`stock_movement_id`) REFERENCES `stock_movements`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `waste_entries` ADD CONSTRAINT `waste_entries_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `waste_entries` ADD CONSTRAINT `waste_entries_shift_id_shifts_id_fk` FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `waste_entries` ADD CONSTRAINT `waste_entries_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `waste_entries` ADD CONSTRAINT `waste_entries_recipe_id_recipes_id_fk` FOREIGN KEY (`recipe_id`) REFERENCES `recipes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `waste_entries` ADD CONSTRAINT `waste_entries_recipe_size_id_recipe_sizes_id_fk` FOREIGN KEY (`recipe_size_id`) REFERENCES `recipe_sizes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `waste_entries` ADD CONSTRAINT `waste_entries_recorded_by_users_id_fk` FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `waste_entries` ADD CONSTRAINT `waste_entries_refund_line_id_refund_lines_id_fk` FOREIGN KEY (`refund_line_id`) REFERENCES `refund_lines`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `waste_entries` ADD CONSTRAINT `waste_entries_shiftId_br_fk` FOREIGN KEY (`branch_id`,`shift_id`) REFERENCES `shifts`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `waste_entries` ADD CONSTRAINT `waste_entries_itemId_br_fk` FOREIGN KEY (`branch_id`,`item_id`) REFERENCES `items`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `waste_entries` ADD CONSTRAINT `waste_entries_recipeId_br_fk` FOREIGN KEY (`branch_id`,`recipe_id`) REFERENCES `recipes`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `waste_entries` ADD CONSTRAINT `waste_entries_recipeSizeId_br_fk` FOREIGN KEY (`branch_id`,`recipe_size_id`) REFERENCES `recipe_sizes`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `waste_entries` ADD CONSTRAINT `waste_entries_refundLineId_br_fk` FOREIGN KEY (`branch_id`,`refund_line_id`) REFERENCES `refund_lines`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `waste_entries` ADD CONSTRAINT `waste_ext_prod_fk` FOREIGN KEY (`branch_id`,`external_product_id`) REFERENCES `external_products`(`branch_id`,`external_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `waste_entries` ADD CONSTRAINT `waste_ext_size_fk` FOREIGN KEY (`branch_id`,`external_size_id`) REFERENCES `external_product_sizes`(`branch_id`,`external_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `admin_branches_branch_idx` ON `admin_branches` (`branch_id`);--> statement-breakpoint
CREATE INDEX `categories_parent_id_idx` ON `categories` (`parent_id`);--> statement-breakpoint
CREATE INDEX `expenses_category_idx` ON `expenses` (`category_id`);--> statement-breakpoint
CREATE INDEX `expenses_shift_idx` ON `expenses` (`shift_id`);--> statement-breakpoint
CREATE INDEX `expenses_date_idx` ON `expenses` (`expense_date`);--> statement-breakpoint
CREATE INDEX `external_modifier_groups_product_idx` ON `external_modifier_groups` (`external_product_id`);--> statement-breakpoint
CREATE INDEX `external_modifier_ingredients_branch_idx` ON `external_modifier_ingredients` (`branch_id`);--> statement-breakpoint
CREATE INDEX `external_modifier_ingredients_item_idx` ON `external_modifier_ingredients` (`item_id`);--> statement-breakpoint
CREATE INDEX `external_modifier_options_group_idx` ON `external_modifier_options` (`external_modifier_group_id`);--> statement-breakpoint
CREATE INDEX `external_orders_created_idx` ON `external_orders_cache` (`external_created_at`);--> statement-breakpoint
CREATE INDEX `external_orders_customer_idx` ON `external_orders_cache` (`customer_name`);--> statement-breakpoint
CREATE INDEX `external_orders_phone_idx` ON `external_orders_cache` (`customer_phone`);--> statement-breakpoint
CREATE INDEX `external_product_ingredients_branch_idx` ON `external_product_ingredients` (`branch_id`);--> statement-breakpoint
CREATE INDEX `external_product_ingredients_item_idx` ON `external_product_ingredients` (`item_id`);--> statement-breakpoint
CREATE INDEX `external_product_sizes_product_idx` ON `external_product_sizes` (`external_product_id`);--> statement-breakpoint
CREATE INDEX `external_products_category_idx` ON `external_products` (`external_category_id`);--> statement-breakpoint
CREATE INDEX `external_products_current_idx` ON `external_products` (`is_current`);--> statement-breakpoint
CREATE INDEX `external_size_ingredients_branch_idx` ON `external_size_ingredients` (`branch_id`);--> statement-breakpoint
CREATE INDEX `external_size_ingredients_item_idx` ON `external_size_ingredients` (`item_id`);--> statement-breakpoint
CREATE INDEX `items_category_id_idx` ON `items` (`category_id`);--> statement-breakpoint
CREATE INDEX `link_codes_branch_idx` ON `link_codes` (`branch_id`);--> statement-breakpoint
CREATE INDEX `order_line_allocations_line_idx` ON `order_line_allocations` (`order_line_id`);--> statement-breakpoint
CREATE INDEX `order_line_allocations_item_idx` ON `order_line_allocations` (`item_id`);--> statement-breakpoint
CREATE INDEX `order_line_modifiers_line_idx` ON `order_line_modifiers` (`order_line_id`);--> statement-breakpoint
CREATE INDEX `order_lines_order_id_idx` ON `order_lines` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_lines_recipe_id_idx` ON `order_lines` (`recipe_id`);--> statement-breakpoint
CREATE INDEX `order_lines_item_id_idx` ON `order_lines` (`item_id`);--> statement-breakpoint
CREATE INDEX `order_lines_external_product_idx` ON `order_lines` (`external_product_id`);--> statement-breakpoint
CREATE INDEX `orders_created_at_idx` ON `orders` (`created_at`);--> statement-breakpoint
CREATE INDEX `orders_cashier_created_idx` ON `orders` (`cashier_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_shift_id_idx` ON `orders` (`shift_id`);--> statement-breakpoint
CREATE INDEX `preparation_allocations_preparation_idx` ON `preparation_allocations` (`preparation_id`);--> statement-breakpoint
CREATE INDEX `preparation_allocations_item_idx` ON `preparation_allocations` (`ingredient_item_id`);--> statement-breakpoint
CREATE INDEX `preparations_recipe_id_idx` ON `preparations` (`recipe_id`);--> statement-breakpoint
CREATE INDEX `preparations_occurred_at_idx` ON `preparations` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `purchase_invoices_supplier_id_idx` ON `purchase_invoices` (`supplier_id`);--> statement-breakpoint
CREATE INDEX `purchase_invoices_purchased_at_idx` ON `purchase_invoices` (`purchased_at`);--> statement-breakpoint
CREATE INDEX `purchase_lines_invoice_id_idx` ON `purchase_lines` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `purchase_lines_item_id_idx` ON `purchase_lines` (`item_id`);--> statement-breakpoint
CREATE INDEX `recipe_ingredients_item_id_idx` ON `recipe_ingredients` (`item_id`);--> statement-breakpoint
CREATE INDEX `recipe_sizes_recipe_id_idx` ON `recipe_sizes` (`recipe_id`);--> statement-breakpoint
CREATE INDEX `recipes_category_id_idx` ON `recipes` (`category_id`);--> statement-breakpoint
CREATE INDEX `refund_line_allocations_refund_line_idx` ON `refund_line_allocations` (`refund_line_id`);--> statement-breakpoint
CREATE INDEX `refund_line_allocations_order_allocation_idx` ON `refund_line_allocations` (`order_line_allocation_id`);--> statement-breakpoint
CREATE INDEX `refund_lines_refund_id_idx` ON `refund_lines` (`refund_id`);--> statement-breakpoint
CREATE INDEX `refund_lines_order_line_idx` ON `refund_lines` (`order_line_id`);--> statement-breakpoint
CREATE INDEX `refunds_order_id_idx` ON `refunds` (`order_id`);--> statement-breakpoint
CREATE INDEX `refunds_shift_id_idx` ON `refunds` (`shift_id`);--> statement-breakpoint
CREATE INDEX `refunds_cashier_created_idx` ON `refunds` (`cashier_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `salary_adjustments_employee_date_idx` ON `salary_adjustments` (`employee_id`,`entry_date`);--> statement-breakpoint
CREATE INDEX `salary_advances_employee_date_idx` ON `salary_advances` (`employee_id`,`entry_date`);--> statement-breakpoint
CREATE INDEX `salary_payments_paid_at_idx` ON `salary_payments` (`paid_at`);--> statement-breakpoint
CREATE INDEX `shift_events_shift_occurred_idx` ON `shift_events` (`shift_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `shifts_cashier_opened_idx` ON `shifts` (`cashier_user_id`,`opened_at`);--> statement-breakpoint
CREATE INDEX `shifts_employee_opened_idx` ON `shifts` (`employee_id`,`opened_at`);--> statement-breakpoint
CREATE INDEX `stock_batches_fifo_idx` ON `stock_batches` (`item_id`,`warehouse`,`received_at`,`id`);--> statement-breakpoint
CREATE INDEX `stock_deficit_allocations_movement_idx` ON `stock_deficit_allocations` (`deficit_movement_id`);--> statement-breakpoint
CREATE INDEX `stock_deficit_allocations_batch_idx` ON `stock_deficit_allocations` (`batch_id`);--> statement-breakpoint
CREATE INDEX `stock_movements_ledger_idx` ON `stock_movements` (`item_id`,`warehouse`,`occurred_at`,`id`);--> statement-breakpoint
CREATE INDEX `stock_movements_batch_id_idx` ON `stock_movements` (`batch_id`);--> statement-breakpoint
CREATE INDEX `stocktake_lines_item_idx` ON `stocktake_lines` (`item_id`);--> statement-breakpoint
CREATE INDEX `stocktakes_created_at_idx` ON `stocktakes` (`created_at`);--> statement-breakpoint
CREATE INDEX `supplier_payments_supplier_id_idx` ON `supplier_payments` (`supplier_id`);--> statement-breakpoint
CREATE INDEX `supplier_payments_invoice_id_idx` ON `supplier_payments` (`purchase_invoice_id`);--> statement-breakpoint
CREATE INDEX `transfer_lines_transfer_idx` ON `transfer_lines` (`transfer_id`);--> statement-breakpoint
CREATE INDEX `transfer_lines_item_idx` ON `transfer_lines` (`item_id`);--> statement-breakpoint
CREATE INDEX `transfer_request_lines_request_idx` ON `transfer_request_lines` (`request_id`);--> statement-breakpoint
CREATE INDEX `transfer_requests_status_created_idx` ON `transfer_requests` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `transfer_requests_requested_by_idx` ON `transfer_requests` (`requested_by`);--> statement-breakpoint
CREATE INDEX `transfers_purchase_invoice_id_idx` ON `transfers` (`purchase_invoice_id`);--> statement-breakpoint
CREATE INDEX `transfers_created_at_idx` ON `transfers` (`created_at`);--> statement-breakpoint
CREATE INDEX `waste_allocations_entry_idx` ON `waste_allocations` (`waste_entry_id`);--> statement-breakpoint
CREATE INDEX `waste_allocations_item_idx` ON `waste_allocations` (`item_id`);--> statement-breakpoint
CREATE INDEX `waste_entries_item_idx` ON `waste_entries` (`item_id`);--> statement-breakpoint
CREATE INDEX `waste_entries_shift_idx` ON `waste_entries` (`shift_id`);--> statement-breakpoint
CREATE INDEX `waste_entries_occurred_idx` ON `waste_entries` (`occurred_at`);