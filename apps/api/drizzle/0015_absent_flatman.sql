ALTER TABLE `users` ADD `employee_id` int;--> statement-breakpoint
INSERT INTO `employees` (`id`, `name`, `is_active`, `created_at`)
SELECT `id`, `name`, `is_active`, `created_at`
FROM `users`
WHERE `role` = 'cashier';--> statement-breakpoint
UPDATE `users`
SET `employee_id` = `id`
WHERE `role` = 'cashier';--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_employee_id_uidx` UNIQUE(`employee_id`);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_employee_id_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE no action ON UPDATE no action;
