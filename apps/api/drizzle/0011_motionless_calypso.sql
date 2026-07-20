ALTER TABLE `order_lines` DROP FOREIGN KEY `order_lines_recipe_size_id_recipe_sizes_id_fk`;
--> statement-breakpoint
ALTER TABLE `orders` ADD `client_request_id` varchar(36);--> statement-breakpoint
UPDATE `orders`
SET `client_request_id` = CONCAT('00000000-0000-4000-8000-', LPAD(`id`, 12, '0'))
WHERE `client_request_id` IS NULL;--> statement-breakpoint
ALTER TABLE `orders` MODIFY `client_request_id` varchar(36) NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_client_request_id_unique` UNIQUE(`client_request_id`);--> statement-breakpoint
ALTER TABLE `order_lines` ADD CONSTRAINT `order_lines_recipe_size_id_recipe_sizes_id_fk` FOREIGN KEY (`recipe_size_id`) REFERENCES `recipe_sizes`(`id`) ON DELETE set null ON UPDATE no action;
