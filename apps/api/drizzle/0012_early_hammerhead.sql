ALTER TABLE `orders` ADD `request_fingerprint` varchar(64);--> statement-breakpoint
UPDATE `orders`
SET `request_fingerprint` = SHA2(CONCAT('legacy-order-', `id`), 256)
WHERE `request_fingerprint` IS NULL;--> statement-breakpoint
ALTER TABLE `orders` MODIFY `request_fingerprint` varchar(64) NOT NULL;
