CREATE TABLE `expense_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(191) NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `expense_categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `expense_categories_name_uidx` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`client_request_id` varchar(36) NOT NULL,
	`request_fingerprint` varchar(64) NOT NULL,
	`type` enum('shift','general') NOT NULL,
	`category_id` int NOT NULL,
	`shift_id` int,
	`amount` decimal(12,2) NOT NULL,
	`expense_date` date NOT NULL,
	`note` varchar(500),
	`recorded_by` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `expenses_id` PRIMARY KEY(`id`),
	CONSTRAINT `expenses_client_request_id_unique` UNIQUE(`client_request_id`),
	CONSTRAINT `expenses_amount_positive_chk` CHECK(`expenses`.`amount` > 0),
	CONSTRAINT `expenses_type_shift_chk` CHECK(((`expenses`.`type` = 'shift' AND `expenses`.`shift_id` IS NOT NULL) OR (`expenses`.`type` = 'general' AND `expenses`.`shift_id` IS NULL)))
);
--> statement-breakpoint
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_category_id_expense_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `expense_categories`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_shift_id_shifts_id_fk` FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `expenses` ADD CONSTRAINT `expenses_recorded_by_users_id_fk` FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `expenses_category_idx` ON `expenses` (`category_id`);--> statement-breakpoint
CREATE INDEX `expenses_shift_idx` ON `expenses` (`shift_id`);--> statement-breakpoint
CREATE INDEX `expenses_date_idx` ON `expenses` (`expense_date`);