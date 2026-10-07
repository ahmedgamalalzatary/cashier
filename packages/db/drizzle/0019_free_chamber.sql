CREATE TABLE `shift_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`shift_id` int NOT NULL,
	`action` enum('open','close','admin_close','reopen','correction') NOT NULL,
	`actor_user_id` int NOT NULL,
	`note` varchar(500),
	`actual_cash` decimal(12,2),
	`expected_cash` decimal(12,2),
	`over_short` decimal(12,2),
	`occurred_at` timestamp NOT NULL,
	CONSTRAINT `shift_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `shift_events` ADD CONSTRAINT `shift_events_shift_id_shifts_id_fk` FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `shift_events` ADD CONSTRAINT `shift_events_actor_user_id_users_id_fk` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `shift_events_shift_occurred_idx` ON `shift_events` (`shift_id`,`occurred_at`);