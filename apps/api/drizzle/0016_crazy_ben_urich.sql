CREATE TABLE `shifts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cashier_user_id` int NOT NULL,
	`employee_id` int NOT NULL,
	`status` enum('open','closed') NOT NULL DEFAULT 'open',
	`open_slot` int,
	`opening_float` decimal(12,2) NOT NULL,
	`opened_at` timestamp NOT NULL,
	`closed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `shifts_id` PRIMARY KEY(`id`),
	CONSTRAINT `shifts_open_slot_uidx` UNIQUE(`open_slot`)
);
--> statement-breakpoint
ALTER TABLE `shifts` ADD CONSTRAINT `shifts_cashier_user_id_users_id_fk` FOREIGN KEY (`cashier_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shifts` ADD CONSTRAINT `shifts_employee_id_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `shifts_cashier_opened_idx` ON `shifts` (`cashier_user_id`,`opened_at`);--> statement-breakpoint
CREATE INDEX `shifts_employee_opened_idx` ON `shifts` (`employee_id`,`opened_at`);