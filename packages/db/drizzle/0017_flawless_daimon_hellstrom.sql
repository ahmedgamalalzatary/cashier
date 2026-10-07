ALTER TABLE `shifts` ADD `closed_by_user_id` int;--> statement-breakpoint
ALTER TABLE `shifts` ADD `actual_cash` decimal(12,2);--> statement-breakpoint
ALTER TABLE `shifts` ADD `expected_cash` decimal(12,2);--> statement-breakpoint
ALTER TABLE `shifts` ADD `over_short` decimal(12,2);--> statement-breakpoint
ALTER TABLE `shifts` ADD CONSTRAINT `shifts_closed_by_user_id_users_id_fk` FOREIGN KEY (`closed_by_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;