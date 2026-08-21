ALTER TABLE `waste_entries` DROP CONSTRAINT `waste_entries_direct_shape_chk`;--> statement-breakpoint
ALTER TABLE `waste_entries` MODIFY COLUMN `target_type` enum('item','recipe','external_product');--> statement-breakpoint
ALTER TABLE `waste_entries` ADD `external_product_id` int;--> statement-breakpoint
ALTER TABLE `waste_entries` ADD `external_size_id` int;--> statement-breakpoint
ALTER TABLE `waste_entries` ADD CONSTRAINT `waste_entries_direct_shape_chk` CHECK (`waste_entries`.`refund_line_id` IS NOT NULL OR (
        `waste_entries`.`client_request_id` IS NOT NULL
        AND `waste_entries`.`reason_code` IS NOT NULL
        AND (
          (
            `waste_entries`.`target_type` = 'item'
            AND `waste_entries`.`item_id` IS NOT NULL
            AND `waste_entries`.`recipe_id` IS NULL
            AND `waste_entries`.`recipe_size_id` IS NULL
            AND `waste_entries`.`external_product_id` IS NULL
            AND `waste_entries`.`external_size_id` IS NULL
          )
          OR
          (
            `waste_entries`.`target_type` = 'recipe'
            AND `waste_entries`.`item_id` IS NULL
            AND `waste_entries`.`recipe_id` IS NOT NULL
            AND `waste_entries`.`recipe_size_id` IS NOT NULL
            AND `waste_entries`.`external_product_id` IS NULL
            AND `waste_entries`.`external_size_id` IS NULL
          )
          OR
          (
            `waste_entries`.`target_type` = 'external_product'
            AND `waste_entries`.`item_id` IS NULL
            AND `waste_entries`.`recipe_id` IS NULL
            AND `waste_entries`.`recipe_size_id` IS NULL
            AND `waste_entries`.`external_product_id` IS NOT NULL
          )
        )
      ));--> statement-breakpoint
ALTER TABLE `waste_entries` ADD CONSTRAINT `waste_ext_prod_fk` FOREIGN KEY (`external_product_id`) REFERENCES `external_products`(`external_id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `waste_entries` ADD CONSTRAINT `waste_ext_size_fk` FOREIGN KEY (`external_size_id`) REFERENCES `external_product_sizes`(`external_id`) ON DELETE no action ON UPDATE no action;
