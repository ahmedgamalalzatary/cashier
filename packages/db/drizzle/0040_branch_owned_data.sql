-- Branch columns and indexes must exist before composite keys and references.
-- Branch columns and indexes must exist before composite keys and references.
ALTER TABLE `external_modifier_groups` DROP FOREIGN KEY `ext_mod_grp_prod_fk`;
--> statement-breakpoint
ALTER TABLE `external_modifier_ingredients` DROP FOREIGN KEY `ext_mod_ing_opt_fk`;
--> statement-breakpoint
ALTER TABLE `external_modifier_options` DROP FOREIGN KEY `ext_mod_opt_grp_fk`;
--> statement-breakpoint
ALTER TABLE `external_product_ingredients` DROP FOREIGN KEY `ext_prod_ing_prod_fk`;
--> statement-breakpoint
ALTER TABLE `external_product_sizes` DROP FOREIGN KEY `ext_size_prod_fk`;
--> statement-breakpoint
ALTER TABLE `external_products` DROP FOREIGN KEY `ext_prod_cat_fk`;
--> statement-breakpoint
ALTER TABLE `external_size_ingredients` DROP FOREIGN KEY `ext_size_ing_size_fk`;
--> statement-breakpoint
ALTER TABLE `order_lines` DROP FOREIGN KEY `order_lines_external_product_id_external_products_external_id_fk`;
--> statement-breakpoint
ALTER TABLE `order_lines` DROP FOREIGN KEY `order_line_ext_size_fk`;
--> statement-breakpoint
ALTER TABLE `refund_line_allocations` DROP FOREIGN KEY `refund_alloc_order_alloc_fk`;
--> statement-breakpoint
ALTER TABLE `refund_line_allocations` DROP FOREIGN KEY `refund_alloc_batch_fk`;
--> statement-breakpoint
ALTER TABLE `stock_deficit_allocations` DROP FOREIGN KEY `stock_deficit_movement_fk`;
--> statement-breakpoint
ALTER TABLE `stock_deficit_allocations` DROP FOREIGN KEY `stock_deficit_batch_fk`;
--> statement-breakpoint
ALTER TABLE `waste_entries` DROP FOREIGN KEY `waste_ext_prod_fk`;
--> statement-breakpoint
ALTER TABLE `waste_entries` DROP FOREIGN KEY `waste_ext_size_fk`;
--> statement-breakpoint
ALTER TABLE `order_line_allocations` DROP FOREIGN KEY `order_line_allocations_stock_movement_id_stock_movements_id_fk`;
--> statement-breakpoint
ALTER TABLE `preparations` DROP FOREIGN KEY `preparations_output_batch_id_stock_batches_id_fk`;
--> statement-breakpoint
ALTER TABLE `recipe_ingredients` DROP FOREIGN KEY `recipe_ingredients_recipe_size_id_recipe_sizes_id_fk`;
--> statement-breakpoint
ALTER TABLE `recipes` DROP FOREIGN KEY `recipes_output_item_id_items_id_fk`;
--> statement-breakpoint
ALTER TABLE `salary_payments` DROP FOREIGN KEY `salary_payments_employee_id_employees_id_fk`;
--> statement-breakpoint
ALTER TABLE `stocktake_lines` DROP FOREIGN KEY `stocktake_lines_stocktake_id_stocktakes_id_fk`;
--> statement-breakpoint
ALTER TABLE `transfer_lines` DROP FOREIGN KEY `transfer_lines_cafe_batch_id_stock_batches_id_fk`;
--> statement-breakpoint
ALTER TABLE `transfers` DROP FOREIGN KEY `transfers_request_id_transfer_requests_id_fk`;
--> statement-breakpoint
ALTER TABLE `waste_allocations` DROP FOREIGN KEY `waste_allocations_stock_movement_id_stock_movements_id_fk`;
--> statement-breakpoint
ALTER TABLE `waste_entries` DROP FOREIGN KEY `waste_entries_refund_line_id_refund_lines_id_fk`;
--> statement-breakpoint
ALTER TABLE `expense_categories` DROP INDEX `expense_categories_name_uidx`;
--> statement-breakpoint
ALTER TABLE `expenses` DROP INDEX `expenses_client_request_id_unique`;
--> statement-breakpoint
ALTER TABLE `external_modifier_ingredients` DROP INDEX `external_modifier_ingredients_uidx`;
--> statement-breakpoint
ALTER TABLE `external_product_ingredients` DROP INDEX `external_product_ingredients_uidx`;
--> statement-breakpoint
ALTER TABLE `external_size_ingredients` DROP INDEX `external_size_ingredients_uidx`;
--> statement-breakpoint
ALTER TABLE `items` DROP INDEX `items_code_uidx`;
--> statement-breakpoint
ALTER TABLE `order_line_allocations` DROP INDEX `order_line_allocations_movement_uidx`;
--> statement-breakpoint
ALTER TABLE `order_line_modifiers` DROP INDEX `order_line_modifiers_line_option_uidx`;
--> statement-breakpoint
ALTER TABLE `orders` DROP INDEX `orders_order_number_unique`;
--> statement-breakpoint
ALTER TABLE `orders` DROP INDEX `orders_client_request_id_unique`;
--> statement-breakpoint
ALTER TABLE `preparations` DROP INDEX `preparations_output_batch_uidx`;
--> statement-breakpoint
ALTER TABLE `purchase_invoices` DROP INDEX `purchase_invoices_supplier_number_uidx`;
--> statement-breakpoint
ALTER TABLE `purchase_invoices` DROP INDEX `purchase_invoices_client_request_uidx`;
--> statement-breakpoint
ALTER TABLE `recipe_ingredients` DROP INDEX `recipe_ingredients_size_item_uidx`;
--> statement-breakpoint
ALTER TABLE `recipe_sizes` DROP INDEX `recipe_sizes_recipe_name_uidx`;
--> statement-breakpoint
ALTER TABLE `recipes` DROP INDEX `recipes_output_item_id_uidx`;
--> statement-breakpoint
ALTER TABLE `refunds` DROP INDEX `refunds_client_request_id_unique`;
--> statement-breakpoint
ALTER TABLE `salary_payments` DROP INDEX `salary_payments_employee_month_uidx`;
--> statement-breakpoint
ALTER TABLE `shifts` DROP INDEX `shifts_open_slot_uidx`;
--> statement-breakpoint
ALTER TABLE `stocktake_lines` DROP INDEX `stocktake_lines_document_item_uidx`;
--> statement-breakpoint
ALTER TABLE `transfer_lines` DROP INDEX `transfer_lines_cafe_batch_uidx`;
--> statement-breakpoint
ALTER TABLE `transfer_request_lines` DROP INDEX `transfer_request_lines_request_item_uidx`;
--> statement-breakpoint
ALTER TABLE `transfer_requests` DROP INDEX `transfer_requests_client_request_uidx`;
--> statement-breakpoint
ALTER TABLE `transfers` DROP INDEX `transfers_request_id_uidx`;
--> statement-breakpoint
ALTER TABLE `waste_allocations` DROP INDEX `waste_allocations_movement_uidx`;
--> statement-breakpoint
ALTER TABLE `waste_entries` DROP INDEX `waste_entries_client_request_id_unique`;
--> statement-breakpoint
ALTER TABLE `waste_entries` DROP INDEX `waste_entries_refund_line_id_unique`;
--> statement-breakpoint
ALTER TABLE `order_lines` DROP INDEX `order_line_ext_size_fk`;
--> statement-breakpoint
ALTER TABLE `refund_line_allocations` DROP INDEX `refund_alloc_batch_fk`;
--> statement-breakpoint
ALTER TABLE `waste_entries` DROP INDEX `waste_ext_prod_fk`;
--> statement-breakpoint
ALTER TABLE `waste_entries` DROP INDEX `waste_ext_size_fk`;
--> statement-breakpoint
ALTER TABLE `categories` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `employees` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `expense_categories` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `expenses` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `external_catalog_sync` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `external_categories` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `external_modifier_groups` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `external_modifier_ingredients` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `external_modifier_options` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `external_orders_cache` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `external_product_ingredients` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `external_product_sizes` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `external_products` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `external_size_ingredients` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `items` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `order_line_allocations` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `order_line_modifiers` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `order_lines` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `orders` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `preparation_allocations` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `preparations` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `purchase_invoices` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `purchase_lines` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `recipe_ingredients` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `recipe_sizes` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `recipes` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `refund_line_allocations` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `refund_lines` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `refunds` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `salary_adjustments` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `salary_advances` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `salary_payments` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `shift_events` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `shifts` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `stock_batches` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `stock_deficit_allocations` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `stock_movements` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `stocktake_lines` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `stocktakes` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `supplier_payments` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `suppliers` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `transfer_lines` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `transfer_request_lines` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `transfer_requests` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `transfers` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `waste_allocations` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `waste_entries` ADD `branch_id` int DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `external_catalog_sync` DROP PRIMARY KEY;
--> statement-breakpoint
ALTER TABLE `external_categories` DROP PRIMARY KEY;
--> statement-breakpoint
ALTER TABLE `external_modifier_groups` DROP PRIMARY KEY;
--> statement-breakpoint
ALTER TABLE `external_modifier_options` DROP PRIMARY KEY;
--> statement-breakpoint
ALTER TABLE `external_orders_cache` DROP PRIMARY KEY;
--> statement-breakpoint
ALTER TABLE `external_product_sizes` DROP PRIMARY KEY;
--> statement-breakpoint
ALTER TABLE `external_products` DROP PRIMARY KEY;
--> statement-breakpoint
ALTER TABLE `external_catalog_sync` ADD PRIMARY KEY(`branch_id`,`id`);
--> statement-breakpoint
ALTER TABLE `external_categories` ADD PRIMARY KEY(`branch_id`,`external_id`);
--> statement-breakpoint
ALTER TABLE `external_modifier_groups` ADD PRIMARY KEY(`branch_id`,`external_id`);
--> statement-breakpoint
ALTER TABLE `external_modifier_options` ADD PRIMARY KEY(`branch_id`,`external_id`);
--> statement-breakpoint
ALTER TABLE `external_orders_cache` ADD PRIMARY KEY(`branch_id`,`external_id`);
--> statement-breakpoint
ALTER TABLE `external_product_sizes` ADD PRIMARY KEY(`branch_id`,`external_id`);
--> statement-breakpoint
ALTER TABLE `external_products` ADD PRIMARY KEY(`branch_id`,`external_id`);
--> statement-breakpoint
ALTER TABLE `categories` ADD CONSTRAINT `categories_branch_id_uidx` UNIQUE(`branch_id`,`id`);
--> statement-breakpoint
ALTER TABLE `employees` ADD CONSTRAINT `employees_branch_id_uidx` UNIQUE(`branch_id`,`id`);
--> statement-breakpoint
ALTER TABLE `expense_categories` ADD CONSTRAINT `expense_categories_branch_id_uidx` UNIQUE(`branch_id`,`id`);
--> statement-breakpoint
ALTER TABLE `expense_categories` ADD CONSTRAINT `expense_categories_name_uidx` UNIQUE(`branch_id`,`name`);
--> statement-breakpoint
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_branch_id_uidx` UNIQUE(`branch_id`,`id`);
--> statement-breakpoint
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_clientRequestId_branch_uidx` UNIQUE(`branch_id`,`client_request_id`);
--> statement-breakpoint
ALTER TABLE `external_modifier_ingredients` ADD CONSTRAINT `external_modifier_ingredients_uidx` UNIQUE(`branch_id`,`external_modifier_option_id`,`item_id`);
--> statement-breakpoint
ALTER TABLE `external_product_ingredients` ADD CONSTRAINT `external_product_ingredients_uidx` UNIQUE(`branch_id`,`external_product_id`,`item_id`);
--> statement-breakpoint
ALTER TABLE `external_size_ingredients` ADD CONSTRAINT `external_size_ingredients_uidx` UNIQUE(`branch_id`,`external_size_id`,`item_id`);
--> statement-breakpoint
ALTER TABLE `items` ADD CONSTRAINT `items_branch_id_uidx` UNIQUE(`branch_id`,`id`);
--> statement-breakpoint
ALTER TABLE `items` ADD CONSTRAINT `items_code_uidx` UNIQUE(`branch_id`,`code`);
--> statement-breakpoint
ALTER TABLE `order_line_allocations` ADD CONSTRAINT `order_line_allocations_branch_id_uidx` UNIQUE(`branch_id`,`id`);
--> statement-breakpoint
ALTER TABLE `order_line_allocations` ADD CONSTRAINT `order_line_allocations_movement_uidx` UNIQUE(`branch_id`,`stock_movement_id`);
--> statement-breakpoint
ALTER TABLE `order_line_modifiers` ADD CONSTRAINT `order_line_modifiers_branch_id_uidx` UNIQUE(`branch_id`,`id`);
--> statement-breakpoint
ALTER TABLE `order_line_modifiers` ADD CONSTRAINT `order_line_modifiers_line_option_uidx` UNIQUE(`branch_id`,`order_line_id`,`external_modifier_option_id`);
--> statement-breakpoint
ALTER TABLE `order_lines` ADD CONSTRAINT `order_lines_branch_id_uidx` UNIQUE(`branch_id`,`id`);
--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_branch_id_uidx` UNIQUE(`branch_id`,`id`);
--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_orderNumber_branch_uidx` UNIQUE(`branch_id`,`order_number`);
--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_clientRequestId_branch_uidx` UNIQUE(`branch_id`,`client_request_id`);
--> statement-breakpoint
ALTER TABLE `preparation_allocations` ADD CONSTRAINT `preparation_allocations_branch_id_uidx` UNIQUE(`branch_id`,`id`);
--> statement-breakpoint
ALTER TABLE `preparations` ADD CONSTRAINT `preparations_branch_id_uidx` UNIQUE(`branch_id`,`id`);
--> statement-breakpoint
ALTER TABLE `preparations` ADD CONSTRAINT `preparations_output_batch_uidx` UNIQUE(`branch_id`,`output_batch_id`);
--> statement-breakpoint
ALTER TABLE `purchase_invoices` ADD CONSTRAINT `purchase_invoices_branch_id_uidx` UNIQUE(`branch_id`,`id`);
--> statement-breakpoint
ALTER TABLE `purchase_invoices` ADD CONSTRAINT `purchase_invoices_supplier_number_uidx` UNIQUE(`branch_id`,`supplier_id`,`invoice_number`);
--> statement-breakpoint
ALTER TABLE `purchase_invoices` ADD CONSTRAINT `purchase_invoices_client_request_uidx` UNIQUE(`branch_id`,`client_request_id`);
--> statement-breakpoint
ALTER TABLE `purchase_lines` ADD CONSTRAINT `purchase_lines_branch_id_uidx` UNIQUE(`branch_id`,`id`);
--> statement-breakpoint
ALTER TABLE `recipe_ingredients` ADD CONSTRAINT `recipe_ingredients_branch_id_uidx` UNIQUE(`branch_id`,`id`);
--> statement-breakpoint
ALTER TABLE `recipe_ingredients` ADD CONSTRAINT `recipe_ingredients_size_item_uidx` UNIQUE(`branch_id`,`recipe_size_id`,`item_id`);
--> statement-breakpoint
ALTER TABLE `recipe_sizes` ADD CONSTRAINT `recipe_sizes_branch_id_uidx` UNIQUE(`branch_id`,`id`);
--> statement-breakpoint
ALTER TABLE `recipe_sizes` ADD CONSTRAINT `recipe_sizes_recipe_name_uidx` UNIQUE(`branch_id`,`recipe_id`,`name`);
--> statement-breakpoint
ALTER TABLE `recipes` ADD CONSTRAINT `recipes_branch_id_uidx` UNIQUE(`branch_id`,`id`);
--> statement-breakpoint
ALTER TABLE `recipes` ADD CONSTRAINT `recipes_output_item_id_uidx` UNIQUE(`branch_id`,`output_item_id`);
--> statement-breakpoint
ALTER TABLE `refund_line_allocations` ADD CONSTRAINT `refund_line_allocations_branch_id_uidx` UNIQUE(`branch_id`,`id`);
--> statement-breakpoint
ALTER TABLE `refund_lines` ADD CONSTRAINT `refund_lines_branch_id_uidx` UNIQUE(`branch_id`,`id`);
--> statement-breakpoint
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_branch_id_uidx` UNIQUE(`branch_id`,`id`);
--> statement-breakpoint
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_clientRequestId_branch_uidx` UNIQUE(`branch_id`,`client_request_id`);
--> statement-breakpoint
ALTER TABLE `salary_adjustments` ADD CONSTRAINT `salary_adjustments_branch_id_uidx` UNIQUE(`branch_id`,`id`);
--> statement-breakpoint
ALTER TABLE `salary_advances` ADD CONSTRAINT `salary_advances_branch_id_uidx` UNIQUE(`branch_id`,`id`);
--> statement-breakpoint
ALTER TABLE `salary_payments` ADD CONSTRAINT `salary_payments_branch_id_uidx` UNIQUE(`branch_id`,`id`);
--> statement-breakpoint
ALTER TABLE `salary_payments` ADD CONSTRAINT `salary_payments_employee_month_uidx` UNIQUE(`branch_id`,`employee_id`,`period_month`);
--> statement-breakpoint
ALTER TABLE `shift_events` ADD CONSTRAINT `shift_events_branch_id_uidx` UNIQUE(`branch_id`,`id`);
--> statement-breakpoint
ALTER TABLE `shifts` ADD CONSTRAINT `shifts_branch_id_uidx` UNIQUE(`branch_id`,`id`);
--> statement-breakpoint
ALTER TABLE `shifts` ADD CONSTRAINT `shifts_open_slot_uidx` UNIQUE(`branch_id`,`open_slot`);
--> statement-breakpoint
ALTER TABLE `stock_batches` ADD CONSTRAINT `stock_batches_branch_id_uidx` UNIQUE(`branch_id`,`id`);
--> statement-breakpoint
ALTER TABLE `stock_deficit_allocations` ADD CONSTRAINT `stock_deficit_allocations_branch_id_uidx` UNIQUE(`branch_id`,`id`);
--> statement-breakpoint
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_branch_id_uidx` UNIQUE(`branch_id`,`id`);
--> statement-breakpoint
ALTER TABLE `stocktake_lines` ADD CONSTRAINT `stocktake_lines_branch_id_uidx` UNIQUE(`branch_id`,`id`);
--> statement-breakpoint
ALTER TABLE `stocktake_lines` ADD CONSTRAINT `stocktake_lines_document_item_uidx` UNIQUE(`branch_id`,`stocktake_id`,`item_id`);
--> statement-breakpoint
ALTER TABLE `stocktakes` ADD CONSTRAINT `stocktakes_branch_id_uidx` UNIQUE(`branch_id`,`id`);
--> statement-breakpoint
ALTER TABLE `supplier_payments` ADD CONSTRAINT `supplier_payments_branch_id_uidx` UNIQUE(`branch_id`,`id`);
--> statement-breakpoint
ALTER TABLE `suppliers` ADD CONSTRAINT `suppliers_branch_id_uidx` UNIQUE(`branch_id`,`id`);
--> statement-breakpoint
ALTER TABLE `transfer_lines` ADD CONSTRAINT `transfer_lines_branch_id_uidx` UNIQUE(`branch_id`,`id`);
--> statement-breakpoint
ALTER TABLE `transfer_lines` ADD CONSTRAINT `transfer_lines_cafe_batch_uidx` UNIQUE(`branch_id`,`cafe_batch_id`);
--> statement-breakpoint
ALTER TABLE `transfer_request_lines` ADD CONSTRAINT `transfer_request_lines_branch_id_uidx` UNIQUE(`branch_id`,`id`);
--> statement-breakpoint
ALTER TABLE `transfer_request_lines` ADD CONSTRAINT `transfer_request_lines_request_item_uidx` UNIQUE(`branch_id`,`request_id`,`item_id`);
--> statement-breakpoint
ALTER TABLE `transfer_requests` ADD CONSTRAINT `transfer_requests_branch_id_uidx` UNIQUE(`branch_id`,`id`);
--> statement-breakpoint
ALTER TABLE `transfer_requests` ADD CONSTRAINT `transfer_requests_client_request_uidx` UNIQUE(`branch_id`,`client_request_id`);
--> statement-breakpoint
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_branch_id_uidx` UNIQUE(`branch_id`,`id`);
--> statement-breakpoint
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_request_id_uidx` UNIQUE(`branch_id`,`request_id`);
--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_branch_id_uidx` UNIQUE(`branch_id`,`id`);
--> statement-breakpoint
ALTER TABLE `waste_allocations` ADD CONSTRAINT `waste_allocations_branch_id_uidx` UNIQUE(`branch_id`,`id`);
--> statement-breakpoint
ALTER TABLE `waste_allocations` ADD CONSTRAINT `waste_allocations_movement_uidx` UNIQUE(`branch_id`,`stock_movement_id`);
--> statement-breakpoint
ALTER TABLE `waste_entries` ADD CONSTRAINT `waste_entries_branch_id_uidx` UNIQUE(`branch_id`,`id`);
--> statement-breakpoint
ALTER TABLE `waste_entries` ADD CONSTRAINT `waste_entries_clientRequestId_branch_uidx` UNIQUE(`branch_id`,`client_request_id`);
--> statement-breakpoint
ALTER TABLE `waste_entries` ADD CONSTRAINT `waste_entries_refundLineId_branch_uidx` UNIQUE(`branch_id`,`refund_line_id`);
--> statement-breakpoint
CREATE INDEX `external_modifier_ingredients_branch_idx` ON `external_modifier_ingredients` (`branch_id`);
--> statement-breakpoint
CREATE INDEX `external_product_ingredients_branch_idx` ON `external_product_ingredients` (`branch_id`);
--> statement-breakpoint
CREATE INDEX `external_size_ingredients_branch_idx` ON `external_size_ingredients` (`branch_id`);
--> statement-breakpoint
ALTER TABLE `categories` ADD CONSTRAINT `categories_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `categories` ADD CONSTRAINT `categories_parentId_br_fk` FOREIGN KEY (`branch_id`,`parent_id`) REFERENCES `categories`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `employees` ADD CONSTRAINT `employees_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `expense_categories` ADD CONSTRAINT `expense_categories_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_categoryId_br_fk` FOREIGN KEY (`branch_id`,`category_id`) REFERENCES `expense_categories`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_shiftId_br_fk` FOREIGN KEY (`branch_id`,`shift_id`) REFERENCES `shifts`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `external_catalog_sync` ADD CONSTRAINT `external_catalog_sync_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `external_categories` ADD CONSTRAINT `external_categories_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `external_modifier_groups` ADD CONSTRAINT `external_modifier_groups_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `external_modifier_groups` ADD CONSTRAINT `ext_mod_grp_prod_fk` FOREIGN KEY (`branch_id`,`external_product_id`) REFERENCES `external_products`(`branch_id`,`external_id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `external_modifier_ingredients` ADD CONSTRAINT `external_modifier_ingredients_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `external_modifier_ingredients` ADD CONSTRAINT `external_modifier_ingredients_itemId_br_fk` FOREIGN KEY (`branch_id`,`item_id`) REFERENCES `items`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `external_modifier_ingredients` ADD CONSTRAINT `ext_mod_ing_opt_fk` FOREIGN KEY (`branch_id`,`external_modifier_option_id`) REFERENCES `external_modifier_options`(`branch_id`,`external_id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `external_modifier_options` ADD CONSTRAINT `external_modifier_options_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `external_modifier_options` ADD CONSTRAINT `ext_mod_opt_grp_fk` FOREIGN KEY (`branch_id`,`external_modifier_group_id`) REFERENCES `external_modifier_groups`(`branch_id`,`external_id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `external_orders_cache` ADD CONSTRAINT `external_orders_cache_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `external_product_ingredients` ADD CONSTRAINT `external_product_ingredients_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `external_product_ingredients` ADD CONSTRAINT `external_product_ingredients_itemId_br_fk` FOREIGN KEY (`branch_id`,`item_id`) REFERENCES `items`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `external_product_ingredients` ADD CONSTRAINT `ext_prod_ing_prod_fk` FOREIGN KEY (`branch_id`,`external_product_id`) REFERENCES `external_products`(`branch_id`,`external_id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `external_product_sizes` ADD CONSTRAINT `external_product_sizes_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `external_product_sizes` ADD CONSTRAINT `ext_size_prod_fk` FOREIGN KEY (`branch_id`,`external_product_id`) REFERENCES `external_products`(`branch_id`,`external_id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `external_products` ADD CONSTRAINT `external_products_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `external_products` ADD CONSTRAINT `ext_prod_cat_fk` FOREIGN KEY (`branch_id`,`external_category_id`) REFERENCES `external_categories`(`branch_id`,`external_id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `external_size_ingredients` ADD CONSTRAINT `external_size_ingredients_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `external_size_ingredients` ADD CONSTRAINT `external_size_ingredients_itemId_br_fk` FOREIGN KEY (`branch_id`,`item_id`) REFERENCES `items`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `external_size_ingredients` ADD CONSTRAINT `ext_size_ing_size_fk` FOREIGN KEY (`branch_id`,`external_size_id`) REFERENCES `external_product_sizes`(`branch_id`,`external_id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `items` ADD CONSTRAINT `items_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `items` ADD CONSTRAINT `items_categoryId_br_fk` FOREIGN KEY (`branch_id`,`category_id`) REFERENCES `categories`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `order_line_allocations` ADD CONSTRAINT `order_line_allocations_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `order_line_allocations` ADD CONSTRAINT `order_line_allocations_orderLineId_br_fk` FOREIGN KEY (`branch_id`,`order_line_id`) REFERENCES `order_lines`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `order_line_allocations` ADD CONSTRAINT `order_line_allocations_itemId_br_fk` FOREIGN KEY (`branch_id`,`item_id`) REFERENCES `items`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `order_line_allocations` ADD CONSTRAINT `order_line_allocations_batchId_br_fk` FOREIGN KEY (`branch_id`,`batch_id`) REFERENCES `stock_batches`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `order_line_allocations` ADD CONSTRAINT `order_line_allocations_stockMovementId_br_fk` FOREIGN KEY (`branch_id`,`stock_movement_id`) REFERENCES `stock_movements`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `order_line_modifiers` ADD CONSTRAINT `order_line_modifiers_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `order_line_modifiers` ADD CONSTRAINT `order_line_modifiers_orderLineId_br_fk` FOREIGN KEY (`branch_id`,`order_line_id`) REFERENCES `order_lines`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `order_lines` ADD CONSTRAINT `order_lines_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `order_lines` ADD CONSTRAINT `order_lines_orderId_br_fk` FOREIGN KEY (`branch_id`,`order_id`) REFERENCES `orders`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `order_lines` ADD CONSTRAINT `order_lines_recipeId_br_fk` FOREIGN KEY (`branch_id`,`recipe_id`) REFERENCES `recipes`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `order_lines` ADD CONSTRAINT `order_lines_itemId_br_fk` FOREIGN KEY (`branch_id`,`item_id`) REFERENCES `items`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `order_lines` ADD CONSTRAINT `order_lines_externalProductId_br_fk` FOREIGN KEY (`branch_id`,`external_product_id`) REFERENCES `external_products`(`branch_id`,`external_id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `order_lines` ADD CONSTRAINT `order_line_ext_size_fk` FOREIGN KEY (`branch_id`,`external_size_id`) REFERENCES `external_product_sizes`(`branch_id`,`external_id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_shiftId_br_fk` FOREIGN KEY (`branch_id`,`shift_id`) REFERENCES `shifts`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `preparation_allocations` ADD CONSTRAINT `preparation_allocations_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `preparation_allocations` ADD CONSTRAINT `preparation_allocations_preparationId_br_fk` FOREIGN KEY (`branch_id`,`preparation_id`) REFERENCES `preparations`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `preparation_allocations` ADD CONSTRAINT `preparation_allocations_ingredientItemId_br_fk` FOREIGN KEY (`branch_id`,`ingredient_item_id`) REFERENCES `items`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `preparation_allocations` ADD CONSTRAINT `preparation_allocations_sourceBatchId_br_fk` FOREIGN KEY (`branch_id`,`source_batch_id`) REFERENCES `stock_batches`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `preparations` ADD CONSTRAINT `preparations_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `preparations` ADD CONSTRAINT `preparations_recipeId_br_fk` FOREIGN KEY (`branch_id`,`recipe_id`) REFERENCES `recipes`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `preparations` ADD CONSTRAINT `preparations_outputItemId_br_fk` FOREIGN KEY (`branch_id`,`output_item_id`) REFERENCES `items`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `preparations` ADD CONSTRAINT `preparations_outputBatchId_br_fk` FOREIGN KEY (`branch_id`,`output_batch_id`) REFERENCES `stock_batches`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `purchase_invoices` ADD CONSTRAINT `purchase_invoices_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `purchase_invoices` ADD CONSTRAINT `purchase_invoices_supplierId_br_fk` FOREIGN KEY (`branch_id`,`supplier_id`) REFERENCES `suppliers`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `purchase_lines` ADD CONSTRAINT `purchase_lines_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `purchase_lines` ADD CONSTRAINT `purchase_lines_invoiceId_br_fk` FOREIGN KEY (`branch_id`,`invoice_id`) REFERENCES `purchase_invoices`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `purchase_lines` ADD CONSTRAINT `purchase_lines_itemId_br_fk` FOREIGN KEY (`branch_id`,`item_id`) REFERENCES `items`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `recipe_ingredients` ADD CONSTRAINT `recipe_ingredients_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `recipe_ingredients` ADD CONSTRAINT `recipe_ingredients_recipeSizeId_br_fk` FOREIGN KEY (`branch_id`,`recipe_size_id`) REFERENCES `recipe_sizes`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `recipe_ingredients` ADD CONSTRAINT `recipe_ingredients_itemId_br_fk` FOREIGN KEY (`branch_id`,`item_id`) REFERENCES `items`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `recipe_sizes` ADD CONSTRAINT `recipe_sizes_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `recipe_sizes` ADD CONSTRAINT `recipe_sizes_recipeId_br_fk` FOREIGN KEY (`branch_id`,`recipe_id`) REFERENCES `recipes`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `recipes` ADD CONSTRAINT `recipes_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `recipes` ADD CONSTRAINT `recipes_categoryId_br_fk` FOREIGN KEY (`branch_id`,`category_id`) REFERENCES `categories`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `recipes` ADD CONSTRAINT `recipes_outputItemId_br_fk` FOREIGN KEY (`branch_id`,`output_item_id`) REFERENCES `items`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `refund_line_allocations` ADD CONSTRAINT `refund_line_allocations_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `refund_line_allocations` ADD CONSTRAINT `refund_line_allocations_refundLineId_br_fk` FOREIGN KEY (`branch_id`,`refund_line_id`) REFERENCES `refund_lines`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `refund_line_allocations` ADD CONSTRAINT `refund_line_allocations_itemId_br_fk` FOREIGN KEY (`branch_id`,`item_id`) REFERENCES `items`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `refund_line_allocations` ADD CONSTRAINT `refund_alloc_order_alloc_fk` FOREIGN KEY (`branch_id`,`order_line_allocation_id`) REFERENCES `order_line_allocations`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `refund_line_allocations` ADD CONSTRAINT `refund_alloc_batch_fk` FOREIGN KEY (`branch_id`,`returned_batch_id`) REFERENCES `stock_batches`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `refund_lines` ADD CONSTRAINT `refund_lines_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `refund_lines` ADD CONSTRAINT `refund_lines_refundId_br_fk` FOREIGN KEY (`branch_id`,`refund_id`) REFERENCES `refunds`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `refund_lines` ADD CONSTRAINT `refund_lines_orderLineId_br_fk` FOREIGN KEY (`branch_id`,`order_line_id`) REFERENCES `order_lines`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_orderId_br_fk` FOREIGN KEY (`branch_id`,`order_id`) REFERENCES `orders`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_shiftId_br_fk` FOREIGN KEY (`branch_id`,`shift_id`) REFERENCES `shifts`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `salary_adjustments` ADD CONSTRAINT `salary_adjustments_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `salary_adjustments` ADD CONSTRAINT `salary_adjustments_employeeId_br_fk` FOREIGN KEY (`branch_id`,`employee_id`) REFERENCES `employees`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `salary_advances` ADD CONSTRAINT `salary_advances_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `salary_advances` ADD CONSTRAINT `salary_advances_employeeId_br_fk` FOREIGN KEY (`branch_id`,`employee_id`) REFERENCES `employees`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `salary_payments` ADD CONSTRAINT `salary_payments_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `salary_payments` ADD CONSTRAINT `salary_payments_employeeId_br_fk` FOREIGN KEY (`branch_id`,`employee_id`) REFERENCES `employees`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `shift_events` ADD CONSTRAINT `shift_events_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `shift_events` ADD CONSTRAINT `shift_events_shiftId_br_fk` FOREIGN KEY (`branch_id`,`shift_id`) REFERENCES `shifts`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `shifts` ADD CONSTRAINT `shifts_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `shifts` ADD CONSTRAINT `shifts_employeeId_br_fk` FOREIGN KEY (`branch_id`,`employee_id`) REFERENCES `employees`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `stock_batches` ADD CONSTRAINT `stock_batches_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `stock_batches` ADD CONSTRAINT `stock_batches_itemId_br_fk` FOREIGN KEY (`branch_id`,`item_id`) REFERENCES `items`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `stock_deficit_allocations` ADD CONSTRAINT `stock_deficit_allocations_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `stock_deficit_allocations` ADD CONSTRAINT `stock_deficit_movement_fk` FOREIGN KEY (`branch_id`,`deficit_movement_id`) REFERENCES `stock_movements`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `stock_deficit_allocations` ADD CONSTRAINT `stock_deficit_batch_fk` FOREIGN KEY (`branch_id`,`batch_id`) REFERENCES `stock_batches`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_itemId_br_fk` FOREIGN KEY (`branch_id`,`item_id`) REFERENCES `items`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_batchId_br_fk` FOREIGN KEY (`branch_id`,`batch_id`) REFERENCES `stock_batches`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `stocktake_lines` ADD CONSTRAINT `stocktake_lines_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `stocktake_lines` ADD CONSTRAINT `stocktake_lines_stocktakeId_br_fk` FOREIGN KEY (`branch_id`,`stocktake_id`) REFERENCES `stocktakes`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `stocktake_lines` ADD CONSTRAINT `stocktake_lines_itemId_br_fk` FOREIGN KEY (`branch_id`,`item_id`) REFERENCES `items`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `stocktakes` ADD CONSTRAINT `stocktakes_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `stocktakes` ADD CONSTRAINT `stocktakes_categoryId_br_fk` FOREIGN KEY (`branch_id`,`category_id`) REFERENCES `categories`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `supplier_payments` ADD CONSTRAINT `supplier_payments_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `supplier_payments` ADD CONSTRAINT `supplier_payments_supplierId_br_fk` FOREIGN KEY (`branch_id`,`supplier_id`) REFERENCES `suppliers`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `supplier_payments` ADD CONSTRAINT `supplier_payments_purchaseInvoiceId_br_fk` FOREIGN KEY (`branch_id`,`purchase_invoice_id`) REFERENCES `purchase_invoices`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `suppliers` ADD CONSTRAINT `suppliers_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `transfer_lines` ADD CONSTRAINT `transfer_lines_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `transfer_lines` ADD CONSTRAINT `transfer_lines_transferId_br_fk` FOREIGN KEY (`branch_id`,`transfer_id`) REFERENCES `transfers`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `transfer_lines` ADD CONSTRAINT `transfer_lines_itemId_br_fk` FOREIGN KEY (`branch_id`,`item_id`) REFERENCES `items`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `transfer_lines` ADD CONSTRAINT `transfer_lines_sourceBatchId_br_fk` FOREIGN KEY (`branch_id`,`source_batch_id`) REFERENCES `stock_batches`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `transfer_lines` ADD CONSTRAINT `transfer_lines_cafeBatchId_br_fk` FOREIGN KEY (`branch_id`,`cafe_batch_id`) REFERENCES `stock_batches`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `transfer_request_lines` ADD CONSTRAINT `transfer_request_lines_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `transfer_request_lines` ADD CONSTRAINT `transfer_request_lines_requestId_br_fk` FOREIGN KEY (`branch_id`,`request_id`) REFERENCES `transfer_requests`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `transfer_request_lines` ADD CONSTRAINT `transfer_request_lines_itemId_br_fk` FOREIGN KEY (`branch_id`,`item_id`) REFERENCES `items`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `transfer_requests` ADD CONSTRAINT `transfer_requests_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `transfer_requests` ADD CONSTRAINT `transfer_requests_shiftId_br_fk` FOREIGN KEY (`branch_id`,`shift_id`) REFERENCES `shifts`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_requestId_br_fk` FOREIGN KEY (`branch_id`,`request_id`) REFERENCES `transfer_requests`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_employeeId_br_fk` FOREIGN KEY (`branch_id`,`employee_id`) REFERENCES `employees`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `waste_allocations` ADD CONSTRAINT `waste_allocations_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `waste_allocations` ADD CONSTRAINT `waste_allocations_wasteEntryId_br_fk` FOREIGN KEY (`branch_id`,`waste_entry_id`) REFERENCES `waste_entries`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `waste_allocations` ADD CONSTRAINT `waste_allocations_itemId_br_fk` FOREIGN KEY (`branch_id`,`item_id`) REFERENCES `items`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `waste_allocations` ADD CONSTRAINT `waste_allocations_batchId_br_fk` FOREIGN KEY (`branch_id`,`batch_id`) REFERENCES `stock_batches`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `waste_allocations` ADD CONSTRAINT `waste_allocations_stockMovementId_br_fk` FOREIGN KEY (`branch_id`,`stock_movement_id`) REFERENCES `stock_movements`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `waste_entries` ADD CONSTRAINT `waste_entries_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `waste_entries` ADD CONSTRAINT `waste_entries_shiftId_br_fk` FOREIGN KEY (`branch_id`,`shift_id`) REFERENCES `shifts`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `waste_entries` ADD CONSTRAINT `waste_entries_itemId_br_fk` FOREIGN KEY (`branch_id`,`item_id`) REFERENCES `items`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `waste_entries` ADD CONSTRAINT `waste_entries_recipeId_br_fk` FOREIGN KEY (`branch_id`,`recipe_id`) REFERENCES `recipes`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `waste_entries` ADD CONSTRAINT `waste_entries_recipeSizeId_br_fk` FOREIGN KEY (`branch_id`,`recipe_size_id`) REFERENCES `recipe_sizes`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `waste_entries` ADD CONSTRAINT `waste_entries_refundLineId_br_fk` FOREIGN KEY (`branch_id`,`refund_line_id`) REFERENCES `refund_lines`(`branch_id`,`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `waste_entries` ADD CONSTRAINT `waste_ext_prod_fk` FOREIGN KEY (`branch_id`,`external_product_id`) REFERENCES `external_products`(`branch_id`,`external_id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `waste_entries` ADD CONSTRAINT `waste_ext_size_fk` FOREIGN KEY (`branch_id`,`external_size_id`) REFERENCES `external_product_sizes`(`branch_id`,`external_id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `order_line_allocations` ADD CONSTRAINT `order_line_allocations_stock_movement_id_stock_movements_id_fk` FOREIGN KEY (`stock_movement_id`) REFERENCES `stock_movements`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `preparations` ADD CONSTRAINT `preparations_output_batch_id_stock_batches_id_fk` FOREIGN KEY (`output_batch_id`) REFERENCES `stock_batches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `recipe_ingredients` ADD CONSTRAINT `recipe_ingredients_recipe_size_id_recipe_sizes_id_fk` FOREIGN KEY (`recipe_size_id`) REFERENCES `recipe_sizes`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `recipes` ADD CONSTRAINT `recipes_output_item_id_items_id_fk` FOREIGN KEY (`output_item_id`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `salary_payments` ADD CONSTRAINT `salary_payments_employee_id_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `stocktake_lines` ADD CONSTRAINT `stocktake_lines_stocktake_id_stocktakes_id_fk` FOREIGN KEY (`stocktake_id`) REFERENCES `stocktakes`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `transfer_lines` ADD CONSTRAINT `transfer_lines_cafe_batch_id_stock_batches_id_fk` FOREIGN KEY (`cafe_batch_id`) REFERENCES `stock_batches`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_request_id_transfer_requests_id_fk` FOREIGN KEY (`request_id`) REFERENCES `transfer_requests`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `waste_allocations` ADD CONSTRAINT `waste_allocations_stock_movement_id_stock_movements_id_fk` FOREIGN KEY (`stock_movement_id`) REFERENCES `stock_movements`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `waste_entries` ADD CONSTRAINT `waste_entries_refund_line_id_refund_lines_id_fk` FOREIGN KEY (`refund_line_id`) REFERENCES `refund_lines`(`id`) ON DELETE no action ON UPDATE no action;
