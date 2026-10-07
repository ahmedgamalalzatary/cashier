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
ALTER TABLE `stock_deficit_allocations` ADD CONSTRAINT `stock_deficit_movement_fk` FOREIGN KEY (`deficit_movement_id`) REFERENCES `stock_movements`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_deficit_allocations` ADD CONSTRAINT `stock_deficit_batch_fk` FOREIGN KEY (`batch_id`) REFERENCES `stock_batches`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `stock_deficit_allocations_movement_idx` ON `stock_deficit_allocations` (`deficit_movement_id`);--> statement-breakpoint
CREATE INDEX `stock_deficit_allocations_batch_idx` ON `stock_deficit_allocations` (`batch_id`);