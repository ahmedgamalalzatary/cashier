CREATE TABLE `branches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(191) NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `branches_id` PRIMARY KEY(`id`),
	CONSTRAINT `branches_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
INSERT INTO `branches` (`id`, `name`) VALUES (1, 'الفرع الرئيسي');--> statement-breakpoint
ALTER TABLE `refunds` DROP CONSTRAINT `refunds_amount_positive_chk`;--> statement-breakpoint
ALTER TABLE `users` ADD `branch_id` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_amount_positive_chk` CHECK (`refunds`.`amount` >= 0);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_branch_id_branches_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON DELETE no action ON UPDATE no action;
