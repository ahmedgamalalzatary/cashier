CREATE TABLE `categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(191) NOT NULL,
	`parent_id` int,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `categories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `category_colors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`category_id` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `category_colors_id` PRIMARY KEY(`id`),
	CONSTRAINT `category_colors_category_name_uidx` UNIQUE(`category_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `category_sizes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`category_id` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `category_sizes_id` PRIMARY KEY(`id`),
	CONSTRAINT `category_sizes_category_name_uidx` UNIQUE(`category_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `employees` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(191) NOT NULL,
	`phone` varchar(50),
	`job_title` varchar(100),
	`hire_date` date,
	`pay_type` enum('monthly','daily','hourly'),
	`pay_rate` decimal(12,2),
	`notes` text,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `employees_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `product_variants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`product_id` int NOT NULL,
	`color_id` int NOT NULL,
	`size_id` int NOT NULL,
	`code` int NOT NULL,
	`barcode` varchar(191),
	`selling_price` decimal(12,2) NOT NULL,
	`main_minimum_level` decimal(14,3) NOT NULL DEFAULT '0',
	`shop_minimum_level` decimal(14,3) NOT NULL DEFAULT '0',
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `product_variants_id` PRIMARY KEY(`id`),
	CONSTRAINT `product_variants_combination_uidx` UNIQUE(`product_id`,`color_id`,`size_id`),
	CONSTRAINT `product_variants_code_uidx` UNIQUE(`code`),
	CONSTRAINT `product_variants_barcode_uidx` UNIQUE(`barcode`)
);
--> statement-breakpoint
CREATE TABLE `order_line_allocations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`order_line_id` int NOT NULL,
	`variant_id` int NOT NULL,
	`variant_name` varchar(191) NOT NULL,
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
	`variant_id` int NOT NULL,
	`product_name` varchar(191) NOT NULL,
	`color_name` varchar(100) NOT NULL,
	`size_name` varchar(100) NOT NULL,
	`variant_code` int NOT NULL,
	`barcode` varchar(191),
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
	`client_request_id` varchar(36) NOT NULL,
	`request_fingerprint` varchar(64) NOT NULL,
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
	CONSTRAINT `orders_order_number_unique` UNIQUE(`order_number`),
	CONSTRAINT `orders_client_request_id_unique` UNIQUE(`client_request_id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(191) NOT NULL,
	`category_id` int NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `purchase_invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplier_id` int NOT NULL,
	`invoice_number` varchar(100),
	`purchased_at` date NOT NULL,
	`notes` text,
	`total_amount` decimal(12,2) NOT NULL,
	`paid_amount` decimal(12,2) NOT NULL,
	`created_by` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `purchase_invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `purchase_invoices_supplier_number_uidx` UNIQUE(`supplier_id`,`invoice_number`)
);
--> statement-breakpoint
CREATE TABLE `purchase_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoice_id` int NOT NULL,
	`variant_id` int NOT NULL,
	`quantity` decimal(14,3) NOT NULL,
	`unit_price` decimal(12,2) NOT NULL,
	`unit_cost` decimal(16,6) NOT NULL,
	`line_total` decimal(12,2) NOT NULL,
	CONSTRAINT `purchase_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `shift_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`shift_id` int NOT NULL,
	`action` enum('open','close','admin_close','reopen','correction') NOT NULL,
	`actor_user_id` int NOT NULL,
	`note` varchar(500),
	`opening_float` decimal(12,2),
	`actual_cash` decimal(12,2),
	`expected_cash` decimal(12,2),
	`over_short` decimal(12,2),
	`occurred_at` timestamp NOT NULL,
	CONSTRAINT `shift_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `shifts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cashier_user_id` int NOT NULL,
	`employee_id` int NOT NULL,
	`status` enum('open','closed') NOT NULL DEFAULT 'open',
	`open_slot` int,
	`opening_float` decimal(12,2) NOT NULL,
	`opened_at` timestamp NOT NULL,
	`closed_at` timestamp,
	`closed_by_user_id` int,
	`actual_cash` decimal(12,2),
	`expected_cash` decimal(12,2),
	`over_short` decimal(12,2),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `shifts_id` PRIMARY KEY(`id`),
	CONSTRAINT `shifts_open_slot_uidx` UNIQUE(`open_slot`)
);
--> statement-breakpoint
CREATE TABLE `stock_batches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`variant_id` int NOT NULL,
	`warehouse` enum('main','shop') NOT NULL,
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
CREATE TABLE `stock_deficit_allocations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deficit_movement_id` int NOT NULL,
	`batch_id` int NOT NULL,
	`quantity` decimal(14,3) NOT NULL,
	`unit_cost` decimal(16,6) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stock_deficit_allocations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`variant_id` int NOT NULL,
	`warehouse` enum('main','shop') NOT NULL,
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
CREATE TABLE `supplier_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`supplier_id` int NOT NULL,
	`purchase_invoice_id` int,
	`amount` decimal(12,2) NOT NULL,
	`paid_at` date NOT NULL,
	`notes` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `supplier_payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(191) NOT NULL,
	`phone` varchar(50),
	`address` varchar(255),
	`notes` text,
	`opening_balance` decimal(12,2) NOT NULL DEFAULT '0',
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `suppliers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transfer_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`transfer_id` int NOT NULL,
	`variant_id` int NOT NULL,
	`quantity` decimal(14,3) NOT NULL,
	`unit_cost` decimal(16,6) NOT NULL,
	`source_batch_id` int NOT NULL,
	`shop_batch_id` int NOT NULL,
	CONSTRAINT `transfer_lines_id` PRIMARY KEY(`id`),
	CONSTRAINT `transfer_lines_shop_batch_uidx` UNIQUE(`shop_batch_id`)
);
--> statement-breakpoint
CREATE TABLE `transfer_request_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`request_id` int NOT NULL,
	`variant_id` int NOT NULL,
	`quantity` decimal(14,3) NOT NULL,
	CONSTRAINT `transfer_request_lines_id` PRIMARY KEY(`id`),
	CONSTRAINT `transfer_request_lines_request_item_uidx` UNIQUE(`request_id`,`variant_id`)
);
--> statement-breakpoint
CREATE TABLE `transfer_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requested_by` int NOT NULL,
	`shift_id` int,
	`notes` text,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`reviewed_by` int,
	`rejection_reason` varchar(500),
	`reviewed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `transfer_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transfers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`request_id` int,
	`created_by` int NOT NULL,
	`approved_by` int NOT NULL,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `transfers_id` PRIMARY KEY(`id`),
	CONSTRAINT `transfers_request_id_uidx` UNIQUE(`request_id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employee_id` int,
	`name` varchar(191) NOT NULL,
	`username` varchar(100) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`token_version` int NOT NULL DEFAULT 0,
	`role` enum('admin','cashier') NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_username_unique` UNIQUE(`username`),
	CONSTRAINT `users_employee_id_uidx` UNIQUE(`employee_id`)
);
--> statement-breakpoint
ALTER TABLE `categories` ADD CONSTRAINT `categories_parent_id_categories_id_fk` FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `category_colors` ADD CONSTRAINT `category_colors_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `category_sizes` ADD CONSTRAINT `category_sizes_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_variants` ADD CONSTRAINT `product_variants_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_variants` ADD CONSTRAINT `product_variants_color_id_category_colors_id_fk` FOREIGN KEY (`color_id`) REFERENCES `category_colors`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `product_variants` ADD CONSTRAINT `product_variants_size_id_category_sizes_id_fk` FOREIGN KEY (`size_id`) REFERENCES `category_sizes`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_line_allocations` ADD CONSTRAINT `order_line_allocations_order_line_id_order_lines_id_fk` FOREIGN KEY (`order_line_id`) REFERENCES `order_lines`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_line_allocations` ADD CONSTRAINT `order_line_allocations_variant_id_product_variants_id_fk` FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_line_allocations` ADD CONSTRAINT `order_line_allocations_batch_id_stock_batches_id_fk` FOREIGN KEY (`batch_id`) REFERENCES `stock_batches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_line_allocations` ADD CONSTRAINT `order_line_allocations_stock_movement_id_stock_movements_id_fk` FOREIGN KEY (`stock_movement_id`) REFERENCES `stock_movements`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_lines` ADD CONSTRAINT `order_lines_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_lines` ADD CONSTRAINT `order_lines_variant_id_product_variants_id_fk` FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_cashier_id_users_id_fk` FOREIGN KEY (`cashier_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_shift_id_shifts_id_fk` FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_invoices` ADD CONSTRAINT `purchase_invoices_supplier_id_suppliers_id_fk` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_invoices` ADD CONSTRAINT `purchase_invoices_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_lines` ADD CONSTRAINT `purchase_lines_invoice_id_purchase_invoices_id_fk` FOREIGN KEY (`invoice_id`) REFERENCES `purchase_invoices`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_lines` ADD CONSTRAINT `purchase_lines_variant_id_product_variants_id_fk` FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shift_events` ADD CONSTRAINT `shift_events_shift_id_shifts_id_fk` FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shift_events` ADD CONSTRAINT `shift_events_actor_user_id_users_id_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shifts` ADD CONSTRAINT `shifts_cashier_user_id_users_id_fk` FOREIGN KEY (`cashier_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shifts` ADD CONSTRAINT `shifts_employee_id_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shifts` ADD CONSTRAINT `shifts_closed_by_user_id_users_id_fk` FOREIGN KEY (`closed_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_batches` ADD CONSTRAINT `stock_batches_variant_id_product_variants_id_fk` FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_deficit_allocations` ADD CONSTRAINT `stock_deficit_movement_fk` FOREIGN KEY (`deficit_movement_id`) REFERENCES `stock_movements`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_deficit_allocations` ADD CONSTRAINT `stock_deficit_batch_fk` FOREIGN KEY (`batch_id`) REFERENCES `stock_batches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_variant_id_product_variants_id_fk` FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_batch_id_stock_batches_id_fk` FOREIGN KEY (`batch_id`) REFERENCES `stock_batches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplier_payments` ADD CONSTRAINT `supplier_payments_supplier_id_suppliers_id_fk` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplier_payments` ADD CONSTRAINT `supplier_payments_purchase_invoice_id_purchase_invoices_id_fk` FOREIGN KEY (`purchase_invoice_id`) REFERENCES `purchase_invoices`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfer_lines` ADD CONSTRAINT `transfer_lines_transfer_id_transfers_id_fk` FOREIGN KEY (`transfer_id`) REFERENCES `transfers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfer_lines` ADD CONSTRAINT `transfer_lines_variant_id_product_variants_id_fk` FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfer_lines` ADD CONSTRAINT `transfer_lines_source_batch_id_stock_batches_id_fk` FOREIGN KEY (`source_batch_id`) REFERENCES `stock_batches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfer_lines` ADD CONSTRAINT `transfer_lines_shop_batch_id_stock_batches_id_fk` FOREIGN KEY (`shop_batch_id`) REFERENCES `stock_batches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfer_request_lines` ADD CONSTRAINT `transfer_request_lines_request_id_transfer_requests_id_fk` FOREIGN KEY (`request_id`) REFERENCES `transfer_requests`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfer_request_lines` ADD CONSTRAINT `transfer_request_lines_variant_id_product_variants_id_fk` FOREIGN KEY (`variant_id`) REFERENCES `product_variants`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfer_requests` ADD CONSTRAINT `transfer_requests_requested_by_users_id_fk` FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfer_requests` ADD CONSTRAINT `transfer_requests_shift_id_shifts_id_fk` FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfer_requests` ADD CONSTRAINT `transfer_requests_reviewed_by_users_id_fk` FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_request_id_transfer_requests_id_fk` FOREIGN KEY (`request_id`) REFERENCES `transfer_requests`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_approved_by_users_id_fk` FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_employee_id_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `categories_parent_id_idx` ON `categories` (`parent_id`);--> statement-breakpoint
CREATE INDEX `category_colors_category_idx` ON `category_colors` (`category_id`);--> statement-breakpoint
CREATE INDEX `category_sizes_category_idx` ON `category_sizes` (`category_id`);--> statement-breakpoint
CREATE INDEX `product_variants_product_idx` ON `product_variants` (`product_id`);--> statement-breakpoint
CREATE INDEX `order_line_allocations_line_idx` ON `order_line_allocations` (`order_line_id`);--> statement-breakpoint
CREATE INDEX `order_line_allocations_variant_idx` ON `order_line_allocations` (`variant_id`);--> statement-breakpoint
CREATE INDEX `order_lines_order_id_idx` ON `order_lines` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_lines_variant_id_idx` ON `order_lines` (`variant_id`);--> statement-breakpoint
CREATE INDEX `orders_created_at_idx` ON `orders` (`created_at`);--> statement-breakpoint
CREATE INDEX `orders_cashier_created_idx` ON `orders` (`cashier_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_shift_id_idx` ON `orders` (`shift_id`);--> statement-breakpoint
CREATE INDEX `products_category_id_idx` ON `products` (`category_id`);--> statement-breakpoint
CREATE INDEX `purchase_invoices_supplier_id_idx` ON `purchase_invoices` (`supplier_id`);--> statement-breakpoint
CREATE INDEX `purchase_invoices_purchased_at_idx` ON `purchase_invoices` (`purchased_at`);--> statement-breakpoint
CREATE INDEX `purchase_lines_invoice_id_idx` ON `purchase_lines` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `purchase_lines_variant_id_idx` ON `purchase_lines` (`variant_id`);--> statement-breakpoint
CREATE INDEX `shift_events_shift_occurred_idx` ON `shift_events` (`shift_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `shifts_cashier_opened_idx` ON `shifts` (`cashier_user_id`,`opened_at`);--> statement-breakpoint
CREATE INDEX `shifts_employee_opened_idx` ON `shifts` (`employee_id`,`opened_at`);--> statement-breakpoint
CREATE INDEX `stock_batches_fifo_idx` ON `stock_batches` (`variant_id`,`warehouse`,`received_at`,`id`);--> statement-breakpoint
CREATE INDEX `stock_deficit_allocations_movement_idx` ON `stock_deficit_allocations` (`deficit_movement_id`);--> statement-breakpoint
CREATE INDEX `stock_deficit_allocations_batch_idx` ON `stock_deficit_allocations` (`batch_id`);--> statement-breakpoint
CREATE INDEX `stock_movements_ledger_idx` ON `stock_movements` (`variant_id`,`warehouse`,`occurred_at`,`id`);--> statement-breakpoint
CREATE INDEX `stock_movements_batch_id_idx` ON `stock_movements` (`batch_id`);--> statement-breakpoint
CREATE INDEX `supplier_payments_supplier_id_idx` ON `supplier_payments` (`supplier_id`);--> statement-breakpoint
CREATE INDEX `supplier_payments_invoice_id_idx` ON `supplier_payments` (`purchase_invoice_id`);--> statement-breakpoint
CREATE INDEX `transfer_lines_transfer_idx` ON `transfer_lines` (`transfer_id`);--> statement-breakpoint
CREATE INDEX `transfer_lines_variant_idx` ON `transfer_lines` (`variant_id`);--> statement-breakpoint
CREATE INDEX `transfer_request_lines_request_idx` ON `transfer_request_lines` (`request_id`);--> statement-breakpoint
CREATE INDEX `transfer_requests_status_created_idx` ON `transfer_requests` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `transfer_requests_requested_by_idx` ON `transfer_requests` (`requested_by`);--> statement-breakpoint
CREATE INDEX `transfers_created_at_idx` ON `transfers` (`created_at`);