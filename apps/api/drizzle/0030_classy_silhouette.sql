CREATE TABLE `external_orders_cache` (
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
	CONSTRAINT `external_orders_cache_external_id` PRIMARY KEY(`external_id`)
);
--> statement-breakpoint
ALTER TABLE `external_catalog_sync` ADD `last_failed_at` timestamp;--> statement-breakpoint
ALTER TABLE `external_catalog_sync` ADD `refresh_requested_at` timestamp;--> statement-breakpoint
ALTER TABLE `external_catalog_sync` ADD `lock_owner` varchar(191);--> statement-breakpoint
ALTER TABLE `external_catalog_sync` ADD `lock_expires_at` timestamp;--> statement-breakpoint
CREATE INDEX `external_orders_created_idx` ON `external_orders_cache` (`external_created_at`);--> statement-breakpoint
CREATE INDEX `external_orders_customer_idx` ON `external_orders_cache` (`customer_name`);--> statement-breakpoint
CREATE INDEX `external_orders_phone_idx` ON `external_orders_cache` (`customer_phone`);