CREATE TABLE `sync_ingest_events` (
	`device_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`seq` bigint unsigned NOT NULL,
	`applied_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `sync_ingest_events_device_id_seq_pk` PRIMARY KEY(`device_id`,`seq`)
);
--> statement-breakpoint
CREATE TABLE `sync_ingest_rows` (
	`device_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`table_name` varchar(64) NOT NULL,
	`row_key` varchar(64) NOT NULL,
	`last_seq` bigint unsigned NOT NULL,
	`applied_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `sync_ingest_rows_device_id_table_name_row_key_pk` PRIMARY KEY(`device_id`,`table_name`,`row_key`)
);
--> statement-breakpoint
ALTER TABLE `sync_ingest_events` ADD CONSTRAINT `sync_ingest_events_device_id_devices_id_fk` FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sync_ingest_rows` ADD CONSTRAINT `sync_ingest_rows_device_id_devices_id_fk` FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `sync_ingest_events_applied_idx` ON `sync_ingest_events` (`applied_at`);--> statement-breakpoint
CREATE INDEX `sync_ingest_rows_device_idx` ON `sync_ingest_rows` (`device_id`);