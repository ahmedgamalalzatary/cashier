ALTER TABLE `external_catalog_sync` MODIFY COLUMN `last_successful_sync_at` timestamp(3);--> statement-breakpoint
ALTER TABLE `external_catalog_sync` MODIFY COLUMN `last_attempt_at` timestamp(3);--> statement-breakpoint
ALTER TABLE `external_catalog_sync` MODIFY COLUMN `last_failed_at` timestamp(3);--> statement-breakpoint
ALTER TABLE `external_catalog_sync` MODIFY COLUMN `refresh_requested_at` timestamp(3);--> statement-breakpoint
ALTER TABLE `external_catalog_sync` MODIFY COLUMN `lock_expires_at` timestamp(3);