CREATE TABLE `refund_line_allocations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`refund_line_id` int NOT NULL,
	`order_line_allocation_id` int NOT NULL,
	`item_id` int NOT NULL,
	`quantity` decimal(14,3) NOT NULL,
	`unit_cost` decimal(16,6) NOT NULL,
	`returned_batch_id` int,
	CONSTRAINT `refund_line_allocations_id` PRIMARY KEY(`id`),
	CONSTRAINT `refund_alloc_quantity_positive_chk` CHECK(`refund_line_allocations`.`quantity` > 0),
	CONSTRAINT `refund_alloc_cost_nonnegative_chk` CHECK(`refund_line_allocations`.`unit_cost` >= 0)
);
--> statement-breakpoint
CREATE TABLE `refund_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`refund_id` int NOT NULL,
	`order_line_id` int NOT NULL,
	`type` enum('recipe','item') NOT NULL,
	`product_name` varchar(191) NOT NULL,
	`size_name` varchar(100),
	`quantity` decimal(14,3) NOT NULL,
	`unit_price` decimal(12,2) NOT NULL,
	`refund_amount` decimal(12,2) NOT NULL,
	`gross_amount` decimal(12,2) NOT NULL,
	`stock_action` enum('return_to_stock','not_returnable'),
	`returned_cost` decimal(30,2) NOT NULL DEFAULT '0',
	CONSTRAINT `refund_lines_id` PRIMARY KEY(`id`),
	CONSTRAINT `refund_lines_quantity_positive_chk` CHECK(`refund_lines`.`quantity` > 0),
	CONSTRAINT `refund_lines_amount_nonnegative_chk` CHECK(`refund_lines`.`refund_amount` >= 0),
	CONSTRAINT `refund_lines_gross_nonnegative_chk` CHECK(`refund_lines`.`gross_amount` >= 0),
	CONSTRAINT `refund_lines_cost_nonnegative_chk` CHECK(`refund_lines`.`returned_cost` >= 0),
	CONSTRAINT `refund_lines_action_type_chk` CHECK(((`refund_lines`.`type` = 'item' AND `refund_lines`.`stock_action` IS NOT NULL) OR (`refund_lines`.`type` = 'recipe' AND `refund_lines`.`stock_action` IS NULL)))
);
--> statement-breakpoint
CREATE TABLE `refunds` (
	`id` int AUTO_INCREMENT NOT NULL,
	`client_request_id` varchar(36) NOT NULL,
	`request_fingerprint` varchar(64) NOT NULL,
	`order_id` int NOT NULL,
	`shift_id` int NOT NULL,
	`cashier_id` int NOT NULL,
	`reason` varchar(500) NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`total_cost_returned` decimal(30,2) NOT NULL DEFAULT '0',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `refunds_id` PRIMARY KEY(`id`),
	CONSTRAINT `refunds_client_request_id_unique` UNIQUE(`client_request_id`),
	CONSTRAINT `refunds_amount_positive_chk` CHECK(`refunds`.`amount` > 0),
	CONSTRAINT `refunds_reason_nonblank_chk` CHECK(CHAR_LENGTH(TRIM(`refunds`.`reason`)) > 0),
	CONSTRAINT `refunds_cost_nonnegative_chk` CHECK(`refunds`.`total_cost_returned` >= 0)
);
--> statement-breakpoint
CREATE TABLE `waste_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`warehouse` enum('main','cafe') NOT NULL,
	`item_id` int NOT NULL,
	`quantity` decimal(14,3) NOT NULL,
	`reason` varchar(500) NOT NULL,
	`total_cost` decimal(30,2) NOT NULL,
	`recorded_by` int NOT NULL,
	`refund_line_id` int,
	`occurred_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `waste_entries_id` PRIMARY KEY(`id`),
	CONSTRAINT `waste_entries_refund_line_id_unique` UNIQUE(`refund_line_id`),
	CONSTRAINT `waste_entries_quantity_positive_chk` CHECK(`waste_entries`.`quantity` > 0),
	CONSTRAINT `waste_entries_cost_nonnegative_chk` CHECK(`waste_entries`.`total_cost` >= 0),
	CONSTRAINT `waste_entries_reason_nonblank_chk` CHECK(CHAR_LENGTH(TRIM(`waste_entries`.`reason`)) > 0)
);
--> statement-breakpoint
ALTER TABLE `refund_line_allocations` ADD CONSTRAINT `refund_line_allocations_refund_line_id_refund_lines_id_fk` FOREIGN KEY (`refund_line_id`) REFERENCES `refund_lines`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refund_line_allocations` ADD CONSTRAINT `refund_line_allocations_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refund_line_allocations` ADD CONSTRAINT `refund_alloc_order_alloc_fk` FOREIGN KEY (`order_line_allocation_id`) REFERENCES `order_line_allocations`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refund_line_allocations` ADD CONSTRAINT `refund_alloc_batch_fk` FOREIGN KEY (`returned_batch_id`) REFERENCES `stock_batches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refund_lines` ADD CONSTRAINT `refund_lines_refund_id_refunds_id_fk` FOREIGN KEY (`refund_id`) REFERENCES `refunds`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refund_lines` ADD CONSTRAINT `refund_lines_order_line_id_order_lines_id_fk` FOREIGN KEY (`order_line_id`) REFERENCES `order_lines`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_shift_id_shifts_id_fk` FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_cashier_id_users_id_fk` FOREIGN KEY (`cashier_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `waste_entries` ADD CONSTRAINT `waste_entries_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `waste_entries` ADD CONSTRAINT `waste_entries_recorded_by_users_id_fk` FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `waste_entries` ADD CONSTRAINT `waste_entries_refund_line_id_refund_lines_id_fk` FOREIGN KEY (`refund_line_id`) REFERENCES `refund_lines`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `refund_line_allocations_refund_line_idx` ON `refund_line_allocations` (`refund_line_id`);--> statement-breakpoint
CREATE INDEX `refund_line_allocations_order_allocation_idx` ON `refund_line_allocations` (`order_line_allocation_id`);--> statement-breakpoint
CREATE INDEX `refund_lines_refund_id_idx` ON `refund_lines` (`refund_id`);--> statement-breakpoint
CREATE INDEX `refund_lines_order_line_idx` ON `refund_lines` (`order_line_id`);--> statement-breakpoint
CREATE INDEX `refunds_order_id_idx` ON `refunds` (`order_id`);--> statement-breakpoint
CREATE INDEX `refunds_shift_id_idx` ON `refunds` (`shift_id`);--> statement-breakpoint
CREATE INDEX `refunds_cashier_created_idx` ON `refunds` (`cashier_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `waste_entries_item_idx` ON `waste_entries` (`item_id`);--> statement-breakpoint
CREATE INDEX `waste_entries_occurred_idx` ON `waste_entries` (`occurred_at`);