ALTER TABLE `employees` ADD `phone` varchar(50);--> statement-breakpoint
ALTER TABLE `employees` ADD `job_title` varchar(100);--> statement-breakpoint
ALTER TABLE `employees` ADD `hire_date` date;--> statement-breakpoint
ALTER TABLE `employees` ADD `pay_type` enum('monthly','daily','hourly');--> statement-breakpoint
ALTER TABLE `employees` ADD `pay_rate` decimal(12,2);--> statement-breakpoint
ALTER TABLE `employees` ADD `notes` text;