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
	`item_id` int NOT NULL,
	`quantity` decimal(14,3) NOT NULL,
	`unit_mode` enum('stock','purchase') NOT NULL,
	`stock_quantity` decimal(14,3) NOT NULL,
	`unit_price` decimal(12,2) NOT NULL,
	`unit_cost` decimal(16,6) NOT NULL,
	`line_total` decimal(12,2) NOT NULL,
	CONSTRAINT `purchase_lines_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `supplier_payments` ADD `purchase_invoice_id` int;--> statement-breakpoint
ALTER TABLE `purchase_invoices` ADD CONSTRAINT `purchase_invoices_supplier_id_suppliers_id_fk` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_invoices` ADD CONSTRAINT `purchase_invoices_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_lines` ADD CONSTRAINT `purchase_lines_invoice_id_purchase_invoices_id_fk` FOREIGN KEY (`invoice_id`) REFERENCES `purchase_invoices`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_lines` ADD CONSTRAINT `purchase_lines_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `purchase_invoices_supplier_id_idx` ON `purchase_invoices` (`supplier_id`);--> statement-breakpoint
CREATE INDEX `purchase_invoices_purchased_at_idx` ON `purchase_invoices` (`purchased_at`);--> statement-breakpoint
CREATE INDEX `purchase_lines_invoice_id_idx` ON `purchase_lines` (`invoice_id`);--> statement-breakpoint
CREATE INDEX `purchase_lines_item_id_idx` ON `purchase_lines` (`item_id`);--> statement-breakpoint
ALTER TABLE `supplier_payments` ADD CONSTRAINT `supplier_payments_purchase_invoice_id_purchase_invoices_id_fk` FOREIGN KEY (`purchase_invoice_id`) REFERENCES `purchase_invoices`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `supplier_payments_invoice_id_idx` ON `supplier_payments` (`purchase_invoice_id`);