CREATE TABLE `salary_adjustments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employee_id` int NOT NULL,
	`type` enum('bonus','deduction') NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`entry_date` date NOT NULL,
	`note` varchar(500),
	`recorded_by` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `salary_adjustments_id` PRIMARY KEY(`id`),
	CONSTRAINT `salary_adjustments_amount_positive_chk` CHECK(`salary_adjustments`.`amount` > 0)
);
--> statement-breakpoint
CREATE TABLE `salary_advances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employee_id` int NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`entry_date` date NOT NULL,
	`note` varchar(500),
	`recorded_by` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `salary_advances_id` PRIMARY KEY(`id`),
	CONSTRAINT `salary_advances_amount_positive_chk` CHECK(`salary_advances`.`amount` > 0)
);
--> statement-breakpoint
CREATE TABLE `salary_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employee_id` int NOT NULL,
	`period_month` date NOT NULL,
	`base_pay` decimal(12,2) NOT NULL,
	`bonuses` decimal(12,2) NOT NULL,
	`deductions` decimal(12,2) NOT NULL,
	`advances` decimal(12,2) NOT NULL,
	`net_pay` decimal(12,2) NOT NULL,
	`paid_by` int NOT NULL,
	`paid_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `salary_payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `salary_payments_employee_month_uidx` UNIQUE(`employee_id`,`period_month`),
	CONSTRAINT `salary_payments_amounts_nonnegative_chk` CHECK(`salary_payments`.`base_pay` >= 0 AND `salary_payments`.`bonuses` >= 0 AND `salary_payments`.`deductions` >= 0 AND `salary_payments`.`advances` >= 0 AND `salary_payments`.`net_pay` >= 0)
);
--> statement-breakpoint
ALTER TABLE `salary_adjustments` ADD CONSTRAINT `salary_adjustments_employee_id_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `salary_adjustments` ADD CONSTRAINT `salary_adjustments_recorded_by_users_id_fk` FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `salary_advances` ADD CONSTRAINT `salary_advances_employee_id_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `salary_advances` ADD CONSTRAINT `salary_advances_recorded_by_users_id_fk` FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `salary_payments` ADD CONSTRAINT `salary_payments_employee_id_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `salary_payments` ADD CONSTRAINT `salary_payments_paid_by_users_id_fk` FOREIGN KEY (`paid_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `salary_adjustments_employee_date_idx` ON `salary_adjustments` (`employee_id`,`entry_date`);--> statement-breakpoint
CREATE INDEX `salary_advances_employee_date_idx` ON `salary_advances` (`employee_id`,`entry_date`);--> statement-breakpoint
CREATE INDEX `salary_payments_paid_at_idx` ON `salary_payments` (`paid_at`);