CREATE TABLE `sync_ingest_pending` (
	`device_id` char(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	`generation` bigint unsigned NOT NULL,
	`table_name` varchar(64) NOT NULL,
	`row_key` varchar(64) NOT NULL,
	`seq` bigint unsigned NOT NULL,
	`op` enum('upsert','delete') NOT NULL,
	`pk` json NOT NULL,
	`row_json` json,
	CONSTRAINT `sync_ingest_pending_device_id_generation_table_name_row_key_pk` PRIMARY KEY(`device_id`,`generation`,`table_name`,`row_key`)
);
--> statement-breakpoint
ALTER TABLE `sync_ingest_events` ADD `generation` bigint unsigned DEFAULT 0 NOT NULL, DROP PRIMARY KEY, ADD PRIMARY KEY(`device_id`,`generation`,`seq`);--> statement-breakpoint
ALTER TABLE `devices` ADD `backup_generation` bigint unsigned DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `devices` ADD `backup_request_id` char(36) CHARACTER SET ascii COLLATE ascii_bin;--> statement-breakpoint
ALTER TABLE `devices` ADD `backup_completed_at` timestamp(3);--> statement-breakpoint
ALTER TABLE `devices` ADD `backup_replace` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `devices` ADD `backup_replace_all` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_ingest_rows` ADD `generation` bigint unsigned DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_state` ADD `backup_generation` bigint unsigned DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sync_state` ADD `bootstrapped_at` timestamp(3);--> statement-breakpoint
ALTER TABLE `sync_ingest_pending` ADD CONSTRAINT `sync_ingest_pending_device_id_devices_id_fk` FOREIGN KEY (`device_id`) REFERENCES `devices`(`id`) ON DELETE no action ON UPDATE no action;