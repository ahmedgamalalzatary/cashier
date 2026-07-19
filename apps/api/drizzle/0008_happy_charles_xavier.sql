CREATE TABLE `transfer_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`transfer_id` int NOT NULL,
	`item_id` int NOT NULL,
	`quantity` decimal(14,3) NOT NULL,
	`unit_cost` decimal(16,6) NOT NULL,
	`source_batch_id` int NOT NULL,
	`cafe_batch_id` int NOT NULL,
	CONSTRAINT `transfer_lines_id` PRIMARY KEY(`id`),
	CONSTRAINT `transfer_lines_cafe_batch_uidx` UNIQUE(`cafe_batch_id`)
);
--> statement-breakpoint
CREATE TABLE `transfer_request_lines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`request_id` int NOT NULL,
	`item_id` int NOT NULL,
	`quantity` decimal(14,3) NOT NULL,
	CONSTRAINT `transfer_request_lines_id` PRIMARY KEY(`id`),
	CONSTRAINT `transfer_request_lines_request_item_uidx` UNIQUE(`request_id`,`item_id`)
);
--> statement-breakpoint
CREATE TABLE `transfer_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requested_by` int NOT NULL,
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
ALTER TABLE `transfer_lines` ADD CONSTRAINT `transfer_lines_transfer_id_transfers_id_fk` FOREIGN KEY (`transfer_id`) REFERENCES `transfers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfer_lines` ADD CONSTRAINT `transfer_lines_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfer_lines` ADD CONSTRAINT `transfer_lines_source_batch_id_stock_batches_id_fk` FOREIGN KEY (`source_batch_id`) REFERENCES `stock_batches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfer_lines` ADD CONSTRAINT `transfer_lines_cafe_batch_id_stock_batches_id_fk` FOREIGN KEY (`cafe_batch_id`) REFERENCES `stock_batches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfer_request_lines` ADD CONSTRAINT `transfer_request_lines_request_id_transfer_requests_id_fk` FOREIGN KEY (`request_id`) REFERENCES `transfer_requests`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfer_request_lines` ADD CONSTRAINT `transfer_request_lines_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfer_requests` ADD CONSTRAINT `transfer_requests_requested_by_users_id_fk` FOREIGN KEY (`requested_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfer_requests` ADD CONSTRAINT `transfer_requests_reviewed_by_users_id_fk` FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_request_id_transfer_requests_id_fk` FOREIGN KEY (`request_id`) REFERENCES `transfer_requests`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transfers` ADD CONSTRAINT `transfers_approved_by_users_id_fk` FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `transfer_lines_transfer_idx` ON `transfer_lines` (`transfer_id`);--> statement-breakpoint
CREATE INDEX `transfer_lines_item_idx` ON `transfer_lines` (`item_id`);--> statement-breakpoint
CREATE INDEX `transfer_request_lines_request_idx` ON `transfer_request_lines` (`request_id`);--> statement-breakpoint
CREATE INDEX `transfer_requests_status_created_idx` ON `transfer_requests` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `transfer_requests_requested_by_idx` ON `transfer_requests` (`requested_by`);--> statement-breakpoint
CREATE INDEX `transfers_created_at_idx` ON `transfers` (`created_at`);