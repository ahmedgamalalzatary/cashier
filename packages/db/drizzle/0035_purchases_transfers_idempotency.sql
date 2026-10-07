ALTER TABLE `purchase_invoices` ADD `client_request_id` varchar(36);--> statement-breakpoint
ALTER TABLE `purchase_invoices` ADD `request_fingerprint` varchar(64);--> statement-breakpoint
ALTER TABLE `transfer_requests` ADD `client_request_id` varchar(36);--> statement-breakpoint
ALTER TABLE `transfer_requests` ADD `request_fingerprint` varchar(64);--> statement-breakpoint
UPDATE `purchase_invoices`
SET `client_request_id` = CONCAT('00000000-0000-4000-8000-', LPAD(`id`, 12, '0'))
WHERE `client_request_id` IS NULL;--> statement-breakpoint
UPDATE `purchase_invoices`
SET `request_fingerprint` = SHA2(CONCAT('legacy-purchase-invoice-', `id`), 256)
WHERE `request_fingerprint` IS NULL;--> statement-breakpoint
UPDATE `transfer_requests`
SET `client_request_id` = CONCAT('00000000-0000-4000-8000-', LPAD(`id`, 12, '0'))
WHERE `client_request_id` IS NULL;--> statement-breakpoint
UPDATE `transfer_requests`
SET `request_fingerprint` = SHA2(CONCAT('legacy-transfer-request-', `id`), 256)
WHERE `request_fingerprint` IS NULL;--> statement-breakpoint
ALTER TABLE `purchase_invoices` MODIFY `client_request_id` varchar(36) NOT NULL;--> statement-breakpoint
ALTER TABLE `purchase_invoices` MODIFY `request_fingerprint` varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `transfer_requests` MODIFY `client_request_id` varchar(36) NOT NULL;--> statement-breakpoint
ALTER TABLE `transfer_requests` MODIFY `request_fingerprint` varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `purchase_invoices` ADD CONSTRAINT `purchase_invoices_client_request_uidx` UNIQUE(`client_request_id`);--> statement-breakpoint
ALTER TABLE `transfer_requests` ADD CONSTRAINT `transfer_requests_client_request_uidx` UNIQUE(`client_request_id`);
