ALTER TABLE `refund_lines` DROP CONSTRAINT `refund_lines_action_type_chk`;--> statement-breakpoint
ALTER TABLE `waste_entries` DROP CONSTRAINT `waste_entries_direct_shape_chk`;--> statement-breakpoint
ALTER TABLE `order_lines` DROP FOREIGN KEY `order_lines_external_product_id_external_products_external_id_fk`;
--> statement-breakpoint
ALTER TABLE `order_lines` DROP FOREIGN KEY `order_line_ext_size_fk`;
--> statement-breakpoint
ALTER TABLE `waste_entries` DROP FOREIGN KEY `waste_ext_prod_fk`;
--> statement-breakpoint
ALTER TABLE `waste_entries` DROP FOREIGN KEY `waste_ext_size_fk`;
--> statement-breakpoint
DELETE FROM `waste_allocations`
WHERE `waste_entry_id` IN (
  SELECT `id` FROM `waste_entries`
  WHERE `target_type` = 'external_product'
     OR `refund_line_id` IN (
       SELECT `id` FROM `refund_lines` WHERE `type` = 'external_product'
     )
);--> statement-breakpoint
DELETE FROM `waste_entries`
WHERE `target_type` = 'external_product'
   OR `refund_line_id` IN (
     SELECT `id` FROM `refund_lines` WHERE `type` = 'external_product'
   );--> statement-breakpoint
DELETE FROM `refund_line_allocations`
WHERE `refund_line_id` IN (
  SELECT `id` FROM `refund_lines` WHERE `type` = 'external_product'
);--> statement-breakpoint
DELETE FROM `refund_lines` WHERE `type` = 'external_product';--> statement-breakpoint
-- External-product refund history is disposable; remove headers left empty.
DELETE FROM `refunds`
WHERE NOT EXISTS (
  SELECT 1 FROM `refund_lines` WHERE `refund_lines`.`refund_id` = `refunds`.`id`
);--> statement-breakpoint
DELETE FROM `order_line_allocations`
WHERE `order_line_id` IN (
  SELECT `id` FROM `order_lines` WHERE `type` = 'external_product'
);--> statement-breakpoint
DROP TABLE `order_line_modifiers`;--> statement-breakpoint
DELETE FROM `order_lines` WHERE `type` = 'external_product';--> statement-breakpoint
-- Preserve local order history and remove only headers with no surviving lines.
DELETE FROM `orders`
WHERE NOT EXISTS (
  SELECT 1 FROM `order_lines` WHERE `order_lines`.`order_id` = `orders`.`id`
)
AND NOT EXISTS (
  SELECT 1 FROM `refunds` WHERE `refunds`.`order_id` = `orders`.`id`
);--> statement-breakpoint
DROP TABLE `external_modifier_ingredients`;--> statement-breakpoint
DROP TABLE `external_modifier_options`;--> statement-breakpoint
DROP TABLE `external_modifier_groups`;--> statement-breakpoint
DROP TABLE `external_product_ingredients`;--> statement-breakpoint
DROP TABLE `external_size_ingredients`;--> statement-breakpoint
DROP TABLE `external_product_sizes`;--> statement-breakpoint
DROP TABLE `external_products`;--> statement-breakpoint
DROP TABLE `external_categories`;--> statement-breakpoint
DROP INDEX `order_lines_external_product_idx` ON `order_lines`;--> statement-breakpoint
ALTER TABLE `order_lines` MODIFY COLUMN `type` enum('recipe','item') NOT NULL;--> statement-breakpoint
ALTER TABLE `refund_lines` MODIFY COLUMN `type` enum('recipe','item') NOT NULL;--> statement-breakpoint
ALTER TABLE `waste_entries` MODIFY COLUMN `target_type` enum('item','recipe');--> statement-breakpoint
ALTER TABLE `refund_lines` ADD CONSTRAINT `refund_lines_action_type_chk` CHECK (((`refund_lines`.`type` = 'item' AND `refund_lines`.`stock_action` IS NOT NULL) OR (`refund_lines`.`type` = 'recipe' AND `refund_lines`.`stock_action` IS NULL)));--> statement-breakpoint
ALTER TABLE `waste_entries` ADD CONSTRAINT `waste_entries_direct_shape_chk` CHECK (`waste_entries`.`refund_line_id` IS NOT NULL OR (
        `waste_entries`.`client_request_id` IS NOT NULL
        AND `waste_entries`.`reason_code` IS NOT NULL
        AND (
          (
            `waste_entries`.`target_type` = 'item'
            AND `waste_entries`.`item_id` IS NOT NULL
            AND `waste_entries`.`recipe_id` IS NULL
            AND `waste_entries`.`recipe_size_id` IS NULL
          )
          OR
          (
            `waste_entries`.`target_type` = 'recipe'
            AND `waste_entries`.`item_id` IS NULL
            AND `waste_entries`.`recipe_id` IS NOT NULL
            AND `waste_entries`.`recipe_size_id` IS NOT NULL
          )
        )
      ));--> statement-breakpoint
ALTER TABLE `order_lines` DROP COLUMN `external_product_id`;--> statement-breakpoint
ALTER TABLE `order_lines` DROP COLUMN `external_size_id`;--> statement-breakpoint
ALTER TABLE `waste_entries` DROP COLUMN `external_product_id`;--> statement-breakpoint
ALTER TABLE `waste_entries` DROP COLUMN `external_size_id`;--> statement-breakpoint
RENAME TABLE `external_catalog_sync` TO `external_orders_sync`;
