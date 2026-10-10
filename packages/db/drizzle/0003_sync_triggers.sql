DROP TRIGGER IF EXISTS `cashier_sync_admin_branches_insert`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_admin_branches_update`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_admin_branches_delete`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_branches_insert`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_branches_update`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_branches_delete`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_categories_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_categories_insert` AFTER INSERT ON `categories` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('categories', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'name', NEW.`name`, 'parent_id', NEW.`parent_id`, 'is_active', NEW.`is_active`, 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_categories_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_categories_update` AFTER UPDATE ON `categories` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`id` <=> NEW.`id`) OR NOT (OLD.`branch_id` <=> NEW.`branch_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('categories', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('categories', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'name', NEW.`name`, 'parent_id', NEW.`parent_id`, 'is_active', NEW.`is_active`, 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_categories_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_categories_delete` AFTER DELETE ON `categories` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('categories', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_devices_insert`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_devices_update`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_devices_delete`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_employees_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_employees_insert` AFTER INSERT ON `employees` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('employees', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'name', NEW.`name`, 'phone', NEW.`phone`, 'job_title', NEW.`job_title`, 'hire_date', NEW.`hire_date`, 'pay_rate', CAST(NEW.`pay_rate` AS CHAR), 'notes', NEW.`notes`, 'is_active', NEW.`is_active`, 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_employees_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_employees_update` AFTER UPDATE ON `employees` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`id` <=> NEW.`id`) OR NOT (OLD.`branch_id` <=> NEW.`branch_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('employees', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('employees', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'name', NEW.`name`, 'phone', NEW.`phone`, 'job_title', NEW.`job_title`, 'hire_date', NEW.`hire_date`, 'pay_rate', CAST(NEW.`pay_rate` AS CHAR), 'notes', NEW.`notes`, 'is_active', NEW.`is_active`, 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_employees_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_employees_delete` AFTER DELETE ON `employees` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('employees', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_expense_categories_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_expense_categories_insert` AFTER INSERT ON `expense_categories` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('expense_categories', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'name', NEW.`name`, 'is_active', NEW.`is_active`, 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_expense_categories_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_expense_categories_update` AFTER UPDATE ON `expense_categories` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`id` <=> NEW.`id`) OR NOT (OLD.`branch_id` <=> NEW.`branch_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('expense_categories', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('expense_categories', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'name', NEW.`name`, 'is_active', NEW.`is_active`, 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_expense_categories_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_expense_categories_delete` AFTER DELETE ON `expense_categories` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('expense_categories', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_expenses_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_expenses_insert` AFTER INSERT ON `expenses` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('expenses', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'client_request_id', NEW.`client_request_id`, 'request_fingerprint', NEW.`request_fingerprint`, 'type', NEW.`type`, 'category_id', NEW.`category_id`, 'shift_id', NEW.`shift_id`, 'amount', CAST(NEW.`amount` AS CHAR), 'expense_date', NEW.`expense_date`, 'note', NEW.`note`, 'recorded_by', NEW.`recorded_by`, 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_expenses_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_expenses_update` AFTER UPDATE ON `expenses` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`id` <=> NEW.`id`) OR NOT (OLD.`branch_id` <=> NEW.`branch_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('expenses', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('expenses', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'client_request_id', NEW.`client_request_id`, 'request_fingerprint', NEW.`request_fingerprint`, 'type', NEW.`type`, 'category_id', NEW.`category_id`, 'shift_id', NEW.`shift_id`, 'amount', CAST(NEW.`amount` AS CHAR), 'expense_date', NEW.`expense_date`, 'note', NEW.`note`, 'recorded_by', NEW.`recorded_by`, 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_expenses_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_expenses_delete` AFTER DELETE ON `expenses` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('expenses', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_external_catalog_sync_insert`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_external_catalog_sync_update`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_external_catalog_sync_delete`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_external_categories_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_external_categories_insert` AFTER INSERT ON `external_categories` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('external_categories', 'upsert', JSON_OBJECT('branch_id', NEW.`branch_id`, 'external_id', NEW.`external_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'external_id', NEW.`external_id`, 'name_ar', NEW.`name_ar`, 'name_en', NEW.`name_en`, 'description_ar', NEW.`description_ar`, 'description_en', NEW.`description_en`, 'is_active', NEW.`is_active`, 'is_visible', NEW.`is_visible`, 'display_order', NEW.`display_order`, 'is_current', NEW.`is_current`, 'synced_at', CAST(NEW.`synced_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_external_categories_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_external_categories_update` AFTER UPDATE ON `external_categories` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`branch_id` <=> NEW.`branch_id`) OR NOT (OLD.`external_id` <=> NEW.`external_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('external_categories', 'delete', JSON_OBJECT('branch_id', OLD.`branch_id`, 'external_id', OLD.`external_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('external_categories', 'upsert', JSON_OBJECT('branch_id', NEW.`branch_id`, 'external_id', NEW.`external_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'external_id', NEW.`external_id`, 'name_ar', NEW.`name_ar`, 'name_en', NEW.`name_en`, 'description_ar', NEW.`description_ar`, 'description_en', NEW.`description_en`, 'is_active', NEW.`is_active`, 'is_visible', NEW.`is_visible`, 'display_order', NEW.`display_order`, 'is_current', NEW.`is_current`, 'synced_at', CAST(NEW.`synced_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_external_categories_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_external_categories_delete` AFTER DELETE ON `external_categories` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('external_categories', 'delete', JSON_OBJECT('branch_id', OLD.`branch_id`, 'external_id', OLD.`external_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_external_modifier_groups_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_external_modifier_groups_insert` AFTER INSERT ON `external_modifier_groups` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('external_modifier_groups', 'upsert', JSON_OBJECT('branch_id', NEW.`branch_id`, 'external_id', NEW.`external_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'external_id', NEW.`external_id`, 'external_product_id', NEW.`external_product_id`, 'name_ar', NEW.`name_ar`, 'name_en', NEW.`name_en`, 'is_required', NEW.`is_required`, 'max_selections', NEW.`max_selections`, 'is_current', NEW.`is_current`, 'synced_at', CAST(NEW.`synced_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_external_modifier_groups_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_external_modifier_groups_update` AFTER UPDATE ON `external_modifier_groups` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`branch_id` <=> NEW.`branch_id`) OR NOT (OLD.`external_id` <=> NEW.`external_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('external_modifier_groups', 'delete', JSON_OBJECT('branch_id', OLD.`branch_id`, 'external_id', OLD.`external_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('external_modifier_groups', 'upsert', JSON_OBJECT('branch_id', NEW.`branch_id`, 'external_id', NEW.`external_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'external_id', NEW.`external_id`, 'external_product_id', NEW.`external_product_id`, 'name_ar', NEW.`name_ar`, 'name_en', NEW.`name_en`, 'is_required', NEW.`is_required`, 'max_selections', NEW.`max_selections`, 'is_current', NEW.`is_current`, 'synced_at', CAST(NEW.`synced_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_external_modifier_groups_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_external_modifier_groups_delete` AFTER DELETE ON `external_modifier_groups` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('external_modifier_groups', 'delete', JSON_OBJECT('branch_id', OLD.`branch_id`, 'external_id', OLD.`external_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_external_modifier_ingredients_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_external_modifier_ingredients_insert` AFTER INSERT ON `external_modifier_ingredients` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('external_modifier_ingredients', 'upsert', JSON_OBJECT('branch_id', NEW.`branch_id`, 'external_modifier_option_id', NEW.`external_modifier_option_id`, 'item_id', NEW.`item_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'external_modifier_option_id', NEW.`external_modifier_option_id`, 'item_id', NEW.`item_id`, 'quantity', CAST(NEW.`quantity` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_external_modifier_ingredients_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_external_modifier_ingredients_update` AFTER UPDATE ON `external_modifier_ingredients` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`branch_id` <=> NEW.`branch_id`) OR NOT (OLD.`external_modifier_option_id` <=> NEW.`external_modifier_option_id`) OR NOT (OLD.`item_id` <=> NEW.`item_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('external_modifier_ingredients', 'delete', JSON_OBJECT('branch_id', OLD.`branch_id`, 'external_modifier_option_id', OLD.`external_modifier_option_id`, 'item_id', OLD.`item_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('external_modifier_ingredients', 'upsert', JSON_OBJECT('branch_id', NEW.`branch_id`, 'external_modifier_option_id', NEW.`external_modifier_option_id`, 'item_id', NEW.`item_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'external_modifier_option_id', NEW.`external_modifier_option_id`, 'item_id', NEW.`item_id`, 'quantity', CAST(NEW.`quantity` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_external_modifier_ingredients_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_external_modifier_ingredients_delete` AFTER DELETE ON `external_modifier_ingredients` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('external_modifier_ingredients', 'delete', JSON_OBJECT('branch_id', OLD.`branch_id`, 'external_modifier_option_id', OLD.`external_modifier_option_id`, 'item_id', OLD.`item_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_external_modifier_options_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_external_modifier_options_insert` AFTER INSERT ON `external_modifier_options` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('external_modifier_options', 'upsert', JSON_OBJECT('branch_id', NEW.`branch_id`, 'external_id', NEW.`external_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'external_id', NEW.`external_id`, 'external_modifier_group_id', NEW.`external_modifier_group_id`, 'name_ar', NEW.`name_ar`, 'name_en', NEW.`name_en`, 'extra_price', CAST(NEW.`extra_price` AS CHAR), 'stock_effect', NEW.`stock_effect`, 'is_current', NEW.`is_current`, 'synced_at', CAST(NEW.`synced_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_external_modifier_options_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_external_modifier_options_update` AFTER UPDATE ON `external_modifier_options` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`branch_id` <=> NEW.`branch_id`) OR NOT (OLD.`external_id` <=> NEW.`external_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('external_modifier_options', 'delete', JSON_OBJECT('branch_id', OLD.`branch_id`, 'external_id', OLD.`external_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('external_modifier_options', 'upsert', JSON_OBJECT('branch_id', NEW.`branch_id`, 'external_id', NEW.`external_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'external_id', NEW.`external_id`, 'external_modifier_group_id', NEW.`external_modifier_group_id`, 'name_ar', NEW.`name_ar`, 'name_en', NEW.`name_en`, 'extra_price', CAST(NEW.`extra_price` AS CHAR), 'stock_effect', NEW.`stock_effect`, 'is_current', NEW.`is_current`, 'synced_at', CAST(NEW.`synced_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_external_modifier_options_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_external_modifier_options_delete` AFTER DELETE ON `external_modifier_options` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('external_modifier_options', 'delete', JSON_OBJECT('branch_id', OLD.`branch_id`, 'external_id', OLD.`external_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_external_orders_cache_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_external_orders_cache_insert` AFTER INSERT ON `external_orders_cache` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('external_orders_cache', 'upsert', JSON_OBJECT('branch_id', NEW.`branch_id`, 'external_id', NEW.`external_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'external_id', NEW.`external_id`, 'customer_name', NEW.`customer_name`, 'customer_phone', NEW.`customer_phone`, 'subtotal', CAST(NEW.`subtotal` AS CHAR), 'discount_amount', CAST(NEW.`discount_amount` AS CHAR), 'total_amount', CAST(NEW.`total_amount` AS CHAR), 'delivery_fee', CAST(NEW.`delivery_fee` AS CHAR), 'external_created_at', NEW.`external_created_at`, 'order_status', NEW.`order_status`, 'payment_status', NEW.`payment_status`, 'payment_method', NEW.`payment_method`, 'order_type', NEW.`order_type`, 'item_count', NEW.`item_count`, 'cached_at', CAST(NEW.`cached_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_external_orders_cache_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_external_orders_cache_update` AFTER UPDATE ON `external_orders_cache` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`branch_id` <=> NEW.`branch_id`) OR NOT (OLD.`external_id` <=> NEW.`external_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('external_orders_cache', 'delete', JSON_OBJECT('branch_id', OLD.`branch_id`, 'external_id', OLD.`external_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('external_orders_cache', 'upsert', JSON_OBJECT('branch_id', NEW.`branch_id`, 'external_id', NEW.`external_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'external_id', NEW.`external_id`, 'customer_name', NEW.`customer_name`, 'customer_phone', NEW.`customer_phone`, 'subtotal', CAST(NEW.`subtotal` AS CHAR), 'discount_amount', CAST(NEW.`discount_amount` AS CHAR), 'total_amount', CAST(NEW.`total_amount` AS CHAR), 'delivery_fee', CAST(NEW.`delivery_fee` AS CHAR), 'external_created_at', NEW.`external_created_at`, 'order_status', NEW.`order_status`, 'payment_status', NEW.`payment_status`, 'payment_method', NEW.`payment_method`, 'order_type', NEW.`order_type`, 'item_count', NEW.`item_count`, 'cached_at', CAST(NEW.`cached_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_external_orders_cache_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_external_orders_cache_delete` AFTER DELETE ON `external_orders_cache` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('external_orders_cache', 'delete', JSON_OBJECT('branch_id', OLD.`branch_id`, 'external_id', OLD.`external_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_external_product_ingredients_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_external_product_ingredients_insert` AFTER INSERT ON `external_product_ingredients` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('external_product_ingredients', 'upsert', JSON_OBJECT('branch_id', NEW.`branch_id`, 'external_product_id', NEW.`external_product_id`, 'item_id', NEW.`item_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'external_product_id', NEW.`external_product_id`, 'item_id', NEW.`item_id`, 'quantity', CAST(NEW.`quantity` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_external_product_ingredients_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_external_product_ingredients_update` AFTER UPDATE ON `external_product_ingredients` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`branch_id` <=> NEW.`branch_id`) OR NOT (OLD.`external_product_id` <=> NEW.`external_product_id`) OR NOT (OLD.`item_id` <=> NEW.`item_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('external_product_ingredients', 'delete', JSON_OBJECT('branch_id', OLD.`branch_id`, 'external_product_id', OLD.`external_product_id`, 'item_id', OLD.`item_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('external_product_ingredients', 'upsert', JSON_OBJECT('branch_id', NEW.`branch_id`, 'external_product_id', NEW.`external_product_id`, 'item_id', NEW.`item_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'external_product_id', NEW.`external_product_id`, 'item_id', NEW.`item_id`, 'quantity', CAST(NEW.`quantity` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_external_product_ingredients_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_external_product_ingredients_delete` AFTER DELETE ON `external_product_ingredients` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('external_product_ingredients', 'delete', JSON_OBJECT('branch_id', OLD.`branch_id`, 'external_product_id', OLD.`external_product_id`, 'item_id', OLD.`item_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_external_product_sizes_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_external_product_sizes_insert` AFTER INSERT ON `external_product_sizes` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('external_product_sizes', 'upsert', JSON_OBJECT('branch_id', NEW.`branch_id`, 'external_id', NEW.`external_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'external_id', NEW.`external_id`, 'external_product_id', NEW.`external_product_id`, 'name_ar', NEW.`name_ar`, 'name_en', NEW.`name_en`, 'price', CAST(NEW.`price` AS CHAR), 'is_default', NEW.`is_default`, 'is_current', NEW.`is_current`, 'synced_at', CAST(NEW.`synced_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_external_product_sizes_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_external_product_sizes_update` AFTER UPDATE ON `external_product_sizes` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`branch_id` <=> NEW.`branch_id`) OR NOT (OLD.`external_id` <=> NEW.`external_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('external_product_sizes', 'delete', JSON_OBJECT('branch_id', OLD.`branch_id`, 'external_id', OLD.`external_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('external_product_sizes', 'upsert', JSON_OBJECT('branch_id', NEW.`branch_id`, 'external_id', NEW.`external_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'external_id', NEW.`external_id`, 'external_product_id', NEW.`external_product_id`, 'name_ar', NEW.`name_ar`, 'name_en', NEW.`name_en`, 'price', CAST(NEW.`price` AS CHAR), 'is_default', NEW.`is_default`, 'is_current', NEW.`is_current`, 'synced_at', CAST(NEW.`synced_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_external_product_sizes_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_external_product_sizes_delete` AFTER DELETE ON `external_product_sizes` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('external_product_sizes', 'delete', JSON_OBJECT('branch_id', OLD.`branch_id`, 'external_id', OLD.`external_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_external_products_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_external_products_insert` AFTER INSERT ON `external_products` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('external_products', 'upsert', JSON_OBJECT('branch_id', NEW.`branch_id`, 'external_id', NEW.`external_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'external_id', NEW.`external_id`, 'external_category_id', NEW.`external_category_id`, 'name_ar', NEW.`name_ar`, 'name_en', NEW.`name_en`, 'description_ar', NEW.`description_ar`, 'description_en', NEW.`description_en`, 'image_url', NEW.`image_url`, 'price', CAST(NEW.`price` AS CHAR), 'discount_percentage', CAST(NEW.`discount_percentage` AS CHAR), 'discount_start', NEW.`discount_start`, 'discount_end', NEW.`discount_end`, 'calories', NEW.`calories`, 'points_reward', NEW.`points_reward`, 'is_available', NEW.`is_available`, 'is_visible', NEW.`is_visible`, 'is_current', NEW.`is_current`, 'synced_at', CAST(NEW.`synced_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_external_products_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_external_products_update` AFTER UPDATE ON `external_products` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`branch_id` <=> NEW.`branch_id`) OR NOT (OLD.`external_id` <=> NEW.`external_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('external_products', 'delete', JSON_OBJECT('branch_id', OLD.`branch_id`, 'external_id', OLD.`external_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('external_products', 'upsert', JSON_OBJECT('branch_id', NEW.`branch_id`, 'external_id', NEW.`external_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'external_id', NEW.`external_id`, 'external_category_id', NEW.`external_category_id`, 'name_ar', NEW.`name_ar`, 'name_en', NEW.`name_en`, 'description_ar', NEW.`description_ar`, 'description_en', NEW.`description_en`, 'image_url', NEW.`image_url`, 'price', CAST(NEW.`price` AS CHAR), 'discount_percentage', CAST(NEW.`discount_percentage` AS CHAR), 'discount_start', NEW.`discount_start`, 'discount_end', NEW.`discount_end`, 'calories', NEW.`calories`, 'points_reward', NEW.`points_reward`, 'is_available', NEW.`is_available`, 'is_visible', NEW.`is_visible`, 'is_current', NEW.`is_current`, 'synced_at', CAST(NEW.`synced_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_external_products_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_external_products_delete` AFTER DELETE ON `external_products` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('external_products', 'delete', JSON_OBJECT('branch_id', OLD.`branch_id`, 'external_id', OLD.`external_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_external_size_ingredients_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_external_size_ingredients_insert` AFTER INSERT ON `external_size_ingredients` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('external_size_ingredients', 'upsert', JSON_OBJECT('branch_id', NEW.`branch_id`, 'external_size_id', NEW.`external_size_id`, 'item_id', NEW.`item_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'external_size_id', NEW.`external_size_id`, 'item_id', NEW.`item_id`, 'quantity', CAST(NEW.`quantity` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_external_size_ingredients_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_external_size_ingredients_update` AFTER UPDATE ON `external_size_ingredients` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`branch_id` <=> NEW.`branch_id`) OR NOT (OLD.`external_size_id` <=> NEW.`external_size_id`) OR NOT (OLD.`item_id` <=> NEW.`item_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('external_size_ingredients', 'delete', JSON_OBJECT('branch_id', OLD.`branch_id`, 'external_size_id', OLD.`external_size_id`, 'item_id', OLD.`item_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('external_size_ingredients', 'upsert', JSON_OBJECT('branch_id', NEW.`branch_id`, 'external_size_id', NEW.`external_size_id`, 'item_id', NEW.`item_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'external_size_id', NEW.`external_size_id`, 'item_id', NEW.`item_id`, 'quantity', CAST(NEW.`quantity` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_external_size_ingredients_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_external_size_ingredients_delete` AFTER DELETE ON `external_size_ingredients` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('external_size_ingredients', 'delete', JSON_OBJECT('branch_id', OLD.`branch_id`, 'external_size_id', OLD.`external_size_id`, 'item_id', OLD.`item_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_items_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_items_insert` AFTER INSERT ON `items` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('items', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'code', NEW.`code`, 'name', NEW.`name`, 'category_id', NEW.`category_id`, 'type', NEW.`type`, 'selling_price', CAST(NEW.`selling_price` AS CHAR), 'stock_unit', NEW.`stock_unit`, 'purchase_unit', NEW.`purchase_unit`, 'purchase_to_stock_factor', CAST(NEW.`purchase_to_stock_factor` AS CHAR), 'main_minimum_level', CAST(NEW.`main_minimum_level` AS CHAR), 'cafe_minimum_level', CAST(NEW.`cafe_minimum_level` AS CHAR), 'is_active', NEW.`is_active`, 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_items_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_items_update` AFTER UPDATE ON `items` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`id` <=> NEW.`id`) OR NOT (OLD.`branch_id` <=> NEW.`branch_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('items', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('items', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'code', NEW.`code`, 'name', NEW.`name`, 'category_id', NEW.`category_id`, 'type', NEW.`type`, 'selling_price', CAST(NEW.`selling_price` AS CHAR), 'stock_unit', NEW.`stock_unit`, 'purchase_unit', NEW.`purchase_unit`, 'purchase_to_stock_factor', CAST(NEW.`purchase_to_stock_factor` AS CHAR), 'main_minimum_level', CAST(NEW.`main_minimum_level` AS CHAR), 'cafe_minimum_level', CAST(NEW.`cafe_minimum_level` AS CHAR), 'is_active', NEW.`is_active`, 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_items_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_items_delete` AFTER DELETE ON `items` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('items', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_link_codes_insert`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_link_codes_update`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_link_codes_delete`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_order_line_allocations_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_order_line_allocations_insert` AFTER INSERT ON `order_line_allocations` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('order_line_allocations', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'order_line_id', NEW.`order_line_id`, 'item_id', NEW.`item_id`, 'item_name', NEW.`item_name`, 'batch_id', NEW.`batch_id`, 'stock_movement_id', NEW.`stock_movement_id`, 'quantity', CAST(NEW.`quantity` AS CHAR), 'unit_cost', CAST(NEW.`unit_cost` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_order_line_allocations_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_order_line_allocations_update` AFTER UPDATE ON `order_line_allocations` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`id` <=> NEW.`id`) OR NOT (OLD.`branch_id` <=> NEW.`branch_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('order_line_allocations', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('order_line_allocations', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'order_line_id', NEW.`order_line_id`, 'item_id', NEW.`item_id`, 'item_name', NEW.`item_name`, 'batch_id', NEW.`batch_id`, 'stock_movement_id', NEW.`stock_movement_id`, 'quantity', CAST(NEW.`quantity` AS CHAR), 'unit_cost', CAST(NEW.`unit_cost` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_order_line_allocations_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_order_line_allocations_delete` AFTER DELETE ON `order_line_allocations` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('order_line_allocations', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_order_line_modifiers_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_order_line_modifiers_insert` AFTER INSERT ON `order_line_modifiers` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('order_line_modifiers', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'order_line_id', NEW.`order_line_id`, 'external_modifier_group_id', NEW.`external_modifier_group_id`, 'external_modifier_option_id', NEW.`external_modifier_option_id`, 'group_name', NEW.`group_name`, 'option_name', NEW.`option_name`, 'quantity', NEW.`quantity`, 'unit_extra_price', CAST(NEW.`unit_extra_price` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_order_line_modifiers_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_order_line_modifiers_update` AFTER UPDATE ON `order_line_modifiers` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`id` <=> NEW.`id`) OR NOT (OLD.`branch_id` <=> NEW.`branch_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('order_line_modifiers', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('order_line_modifiers', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'order_line_id', NEW.`order_line_id`, 'external_modifier_group_id', NEW.`external_modifier_group_id`, 'external_modifier_option_id', NEW.`external_modifier_option_id`, 'group_name', NEW.`group_name`, 'option_name', NEW.`option_name`, 'quantity', NEW.`quantity`, 'unit_extra_price', CAST(NEW.`unit_extra_price` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_order_line_modifiers_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_order_line_modifiers_delete` AFTER DELETE ON `order_line_modifiers` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('order_line_modifiers', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_order_lines_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_order_lines_insert` AFTER INSERT ON `order_lines` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('order_lines', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'order_id', NEW.`order_id`, 'type', NEW.`type`, 'recipe_id', NEW.`recipe_id`, 'recipe_size_id', NEW.`recipe_size_id`, 'item_id', NEW.`item_id`, 'external_product_id', NEW.`external_product_id`, 'external_size_id', NEW.`external_size_id`, 'product_name', NEW.`product_name`, 'size_name', NEW.`size_name`, 'quantity', CAST(NEW.`quantity` AS CHAR), 'unit_price', CAST(NEW.`unit_price` AS CHAR), 'line_subtotal', CAST(NEW.`line_subtotal` AS CHAR), 'total_cost', CAST(NEW.`total_cost` AS CHAR), 'has_stock_deficit', NEW.`has_stock_deficit`));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_order_lines_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_order_lines_update` AFTER UPDATE ON `order_lines` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`id` <=> NEW.`id`) OR NOT (OLD.`branch_id` <=> NEW.`branch_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('order_lines', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('order_lines', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'order_id', NEW.`order_id`, 'type', NEW.`type`, 'recipe_id', NEW.`recipe_id`, 'recipe_size_id', NEW.`recipe_size_id`, 'item_id', NEW.`item_id`, 'external_product_id', NEW.`external_product_id`, 'external_size_id', NEW.`external_size_id`, 'product_name', NEW.`product_name`, 'size_name', NEW.`size_name`, 'quantity', CAST(NEW.`quantity` AS CHAR), 'unit_price', CAST(NEW.`unit_price` AS CHAR), 'line_subtotal', CAST(NEW.`line_subtotal` AS CHAR), 'total_cost', CAST(NEW.`total_cost` AS CHAR), 'has_stock_deficit', NEW.`has_stock_deficit`));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_order_lines_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_order_lines_delete` AFTER DELETE ON `order_lines` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('order_lines', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_orders_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_orders_insert` AFTER INSERT ON `orders` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('orders', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'order_number', NEW.`order_number`, 'client_request_id', NEW.`client_request_id`, 'request_fingerprint', NEW.`request_fingerprint`, 'cashier_id', NEW.`cashier_id`, 'shift_id', NEW.`shift_id`, 'subtotal', CAST(NEW.`subtotal` AS CHAR), 'discount_type', NEW.`discount_type`, 'discount_value', CAST(NEW.`discount_value` AS CHAR), 'discount_amount', CAST(NEW.`discount_amount` AS CHAR), 'total', CAST(NEW.`total` AS CHAR), 'cash_received', CAST(NEW.`cash_received` AS CHAR), 'change_amount', CAST(NEW.`change_amount` AS CHAR), 'total_cost', CAST(NEW.`total_cost` AS CHAR), 'is_negative_stock', NEW.`is_negative_stock`, 'is_admin_sale', NEW.`is_admin_sale`, 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_orders_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_orders_update` AFTER UPDATE ON `orders` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`id` <=> NEW.`id`) OR NOT (OLD.`branch_id` <=> NEW.`branch_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('orders', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('orders', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'order_number', NEW.`order_number`, 'client_request_id', NEW.`client_request_id`, 'request_fingerprint', NEW.`request_fingerprint`, 'cashier_id', NEW.`cashier_id`, 'shift_id', NEW.`shift_id`, 'subtotal', CAST(NEW.`subtotal` AS CHAR), 'discount_type', NEW.`discount_type`, 'discount_value', CAST(NEW.`discount_value` AS CHAR), 'discount_amount', CAST(NEW.`discount_amount` AS CHAR), 'total', CAST(NEW.`total` AS CHAR), 'cash_received', CAST(NEW.`cash_received` AS CHAR), 'change_amount', CAST(NEW.`change_amount` AS CHAR), 'total_cost', CAST(NEW.`total_cost` AS CHAR), 'is_negative_stock', NEW.`is_negative_stock`, 'is_admin_sale', NEW.`is_admin_sale`, 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_orders_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_orders_delete` AFTER DELETE ON `orders` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('orders', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_preparation_allocations_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_preparation_allocations_insert` AFTER INSERT ON `preparation_allocations` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('preparation_allocations', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'preparation_id', NEW.`preparation_id`, 'ingredient_item_id', NEW.`ingredient_item_id`, 'ingredient_item_name', NEW.`ingredient_item_name`, 'quantity', CAST(NEW.`quantity` AS CHAR), 'unit_cost', CAST(NEW.`unit_cost` AS CHAR), 'source_batch_id', NEW.`source_batch_id`));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_preparation_allocations_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_preparation_allocations_update` AFTER UPDATE ON `preparation_allocations` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`id` <=> NEW.`id`) OR NOT (OLD.`branch_id` <=> NEW.`branch_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('preparation_allocations', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('preparation_allocations', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'preparation_id', NEW.`preparation_id`, 'ingredient_item_id', NEW.`ingredient_item_id`, 'ingredient_item_name', NEW.`ingredient_item_name`, 'quantity', CAST(NEW.`quantity` AS CHAR), 'unit_cost', CAST(NEW.`unit_cost` AS CHAR), 'source_batch_id', NEW.`source_batch_id`));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_preparation_allocations_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_preparation_allocations_delete` AFTER DELETE ON `preparation_allocations` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('preparation_allocations', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_preparations_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_preparations_insert` AFTER INSERT ON `preparations` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('preparations', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'recipe_id', NEW.`recipe_id`, 'recipe_name', NEW.`recipe_name`, 'output_item_id', NEW.`output_item_id`, 'output_item_name', NEW.`output_item_name`, 'produced_quantity', CAST(NEW.`produced_quantity` AS CHAR), 'total_cost', CAST(NEW.`total_cost` AS CHAR), 'unit_cost', CAST(NEW.`unit_cost` AS CHAR), 'output_batch_id', NEW.`output_batch_id`, 'prepared_by', NEW.`prepared_by`, 'notes', NEW.`notes`, 'occurred_at', CAST(NEW.`occurred_at` AS CHAR), 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_preparations_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_preparations_update` AFTER UPDATE ON `preparations` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`id` <=> NEW.`id`) OR NOT (OLD.`branch_id` <=> NEW.`branch_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('preparations', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('preparations', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'recipe_id', NEW.`recipe_id`, 'recipe_name', NEW.`recipe_name`, 'output_item_id', NEW.`output_item_id`, 'output_item_name', NEW.`output_item_name`, 'produced_quantity', CAST(NEW.`produced_quantity` AS CHAR), 'total_cost', CAST(NEW.`total_cost` AS CHAR), 'unit_cost', CAST(NEW.`unit_cost` AS CHAR), 'output_batch_id', NEW.`output_batch_id`, 'prepared_by', NEW.`prepared_by`, 'notes', NEW.`notes`, 'occurred_at', CAST(NEW.`occurred_at` AS CHAR), 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_preparations_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_preparations_delete` AFTER DELETE ON `preparations` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('preparations', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_purchase_invoices_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_purchase_invoices_insert` AFTER INSERT ON `purchase_invoices` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('purchase_invoices', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'supplier_id', NEW.`supplier_id`, 'invoice_number', NEW.`invoice_number`, 'purchased_at', NEW.`purchased_at`, 'notes', NEW.`notes`, 'total_amount', CAST(NEW.`total_amount` AS CHAR), 'paid_amount', CAST(NEW.`paid_amount` AS CHAR), 'created_by', NEW.`created_by`, 'client_request_id', NEW.`client_request_id`, 'request_fingerprint', NEW.`request_fingerprint`, 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_purchase_invoices_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_purchase_invoices_update` AFTER UPDATE ON `purchase_invoices` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`id` <=> NEW.`id`) OR NOT (OLD.`branch_id` <=> NEW.`branch_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('purchase_invoices', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('purchase_invoices', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'supplier_id', NEW.`supplier_id`, 'invoice_number', NEW.`invoice_number`, 'purchased_at', NEW.`purchased_at`, 'notes', NEW.`notes`, 'total_amount', CAST(NEW.`total_amount` AS CHAR), 'paid_amount', CAST(NEW.`paid_amount` AS CHAR), 'created_by', NEW.`created_by`, 'client_request_id', NEW.`client_request_id`, 'request_fingerprint', NEW.`request_fingerprint`, 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_purchase_invoices_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_purchase_invoices_delete` AFTER DELETE ON `purchase_invoices` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('purchase_invoices', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_purchase_lines_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_purchase_lines_insert` AFTER INSERT ON `purchase_lines` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('purchase_lines', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'invoice_id', NEW.`invoice_id`, 'item_id', NEW.`item_id`, 'quantity', CAST(NEW.`quantity` AS CHAR), 'unit_mode', NEW.`unit_mode`, 'stock_quantity', CAST(NEW.`stock_quantity` AS CHAR), 'unit_price', CAST(NEW.`unit_price` AS CHAR), 'unit_cost', CAST(NEW.`unit_cost` AS CHAR), 'line_total', CAST(NEW.`line_total` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_purchase_lines_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_purchase_lines_update` AFTER UPDATE ON `purchase_lines` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`id` <=> NEW.`id`) OR NOT (OLD.`branch_id` <=> NEW.`branch_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('purchase_lines', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('purchase_lines', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'invoice_id', NEW.`invoice_id`, 'item_id', NEW.`item_id`, 'quantity', CAST(NEW.`quantity` AS CHAR), 'unit_mode', NEW.`unit_mode`, 'stock_quantity', CAST(NEW.`stock_quantity` AS CHAR), 'unit_price', CAST(NEW.`unit_price` AS CHAR), 'unit_cost', CAST(NEW.`unit_cost` AS CHAR), 'line_total', CAST(NEW.`line_total` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_purchase_lines_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_purchase_lines_delete` AFTER DELETE ON `purchase_lines` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('purchase_lines', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_recipe_ingredients_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_recipe_ingredients_insert` AFTER INSERT ON `recipe_ingredients` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('recipe_ingredients', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'recipe_size_id', NEW.`recipe_size_id`, 'item_id', NEW.`item_id`, 'quantity', CAST(NEW.`quantity` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_recipe_ingredients_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_recipe_ingredients_update` AFTER UPDATE ON `recipe_ingredients` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`id` <=> NEW.`id`) OR NOT (OLD.`branch_id` <=> NEW.`branch_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('recipe_ingredients', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('recipe_ingredients', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'recipe_size_id', NEW.`recipe_size_id`, 'item_id', NEW.`item_id`, 'quantity', CAST(NEW.`quantity` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_recipe_ingredients_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_recipe_ingredients_delete` AFTER DELETE ON `recipe_ingredients` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('recipe_ingredients', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_recipe_sizes_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_recipe_sizes_insert` AFTER INSERT ON `recipe_sizes` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('recipe_sizes', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'recipe_id', NEW.`recipe_id`, 'name', NEW.`name`, 'selling_price', CAST(NEW.`selling_price` AS CHAR), 'output_quantity', CAST(NEW.`output_quantity` AS CHAR), 'sort_order', NEW.`sort_order`));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_recipe_sizes_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_recipe_sizes_update` AFTER UPDATE ON `recipe_sizes` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`id` <=> NEW.`id`) OR NOT (OLD.`branch_id` <=> NEW.`branch_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('recipe_sizes', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('recipe_sizes', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'recipe_id', NEW.`recipe_id`, 'name', NEW.`name`, 'selling_price', CAST(NEW.`selling_price` AS CHAR), 'output_quantity', CAST(NEW.`output_quantity` AS CHAR), 'sort_order', NEW.`sort_order`));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_recipe_sizes_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_recipe_sizes_delete` AFTER DELETE ON `recipe_sizes` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('recipe_sizes', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_recipes_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_recipes_insert` AFTER INSERT ON `recipes` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('recipes', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'name', NEW.`name`, 'type', NEW.`type`, 'category_id', NEW.`category_id`, 'output_item_id', NEW.`output_item_id`, 'is_active', NEW.`is_active`, 'created_at', CAST(NEW.`created_at` AS CHAR), 'updated_at', CAST(NEW.`updated_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_recipes_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_recipes_update` AFTER UPDATE ON `recipes` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`id` <=> NEW.`id`) OR NOT (OLD.`branch_id` <=> NEW.`branch_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('recipes', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('recipes', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'name', NEW.`name`, 'type', NEW.`type`, 'category_id', NEW.`category_id`, 'output_item_id', NEW.`output_item_id`, 'is_active', NEW.`is_active`, 'created_at', CAST(NEW.`created_at` AS CHAR), 'updated_at', CAST(NEW.`updated_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_recipes_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_recipes_delete` AFTER DELETE ON `recipes` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('recipes', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_refund_line_allocations_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_refund_line_allocations_insert` AFTER INSERT ON `refund_line_allocations` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('refund_line_allocations', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'refund_line_id', NEW.`refund_line_id`, 'order_line_allocation_id', NEW.`order_line_allocation_id`, 'item_id', NEW.`item_id`, 'quantity', CAST(NEW.`quantity` AS CHAR), 'unit_cost', CAST(NEW.`unit_cost` AS CHAR), 'returned_batch_id', NEW.`returned_batch_id`));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_refund_line_allocations_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_refund_line_allocations_update` AFTER UPDATE ON `refund_line_allocations` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`id` <=> NEW.`id`) OR NOT (OLD.`branch_id` <=> NEW.`branch_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('refund_line_allocations', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('refund_line_allocations', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'refund_line_id', NEW.`refund_line_id`, 'order_line_allocation_id', NEW.`order_line_allocation_id`, 'item_id', NEW.`item_id`, 'quantity', CAST(NEW.`quantity` AS CHAR), 'unit_cost', CAST(NEW.`unit_cost` AS CHAR), 'returned_batch_id', NEW.`returned_batch_id`));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_refund_line_allocations_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_refund_line_allocations_delete` AFTER DELETE ON `refund_line_allocations` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('refund_line_allocations', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_refund_lines_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_refund_lines_insert` AFTER INSERT ON `refund_lines` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('refund_lines', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'refund_id', NEW.`refund_id`, 'order_line_id', NEW.`order_line_id`, 'type', NEW.`type`, 'product_name', NEW.`product_name`, 'size_name', NEW.`size_name`, 'quantity', CAST(NEW.`quantity` AS CHAR), 'unit_price', CAST(NEW.`unit_price` AS CHAR), 'refund_amount', CAST(NEW.`refund_amount` AS CHAR), 'gross_amount', CAST(NEW.`gross_amount` AS CHAR), 'stock_action', NEW.`stock_action`, 'returned_cost', CAST(NEW.`returned_cost` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_refund_lines_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_refund_lines_update` AFTER UPDATE ON `refund_lines` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`id` <=> NEW.`id`) OR NOT (OLD.`branch_id` <=> NEW.`branch_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('refund_lines', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('refund_lines', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'refund_id', NEW.`refund_id`, 'order_line_id', NEW.`order_line_id`, 'type', NEW.`type`, 'product_name', NEW.`product_name`, 'size_name', NEW.`size_name`, 'quantity', CAST(NEW.`quantity` AS CHAR), 'unit_price', CAST(NEW.`unit_price` AS CHAR), 'refund_amount', CAST(NEW.`refund_amount` AS CHAR), 'gross_amount', CAST(NEW.`gross_amount` AS CHAR), 'stock_action', NEW.`stock_action`, 'returned_cost', CAST(NEW.`returned_cost` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_refund_lines_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_refund_lines_delete` AFTER DELETE ON `refund_lines` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('refund_lines', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_refunds_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_refunds_insert` AFTER INSERT ON `refunds` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('refunds', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'client_request_id', NEW.`client_request_id`, 'request_fingerprint', NEW.`request_fingerprint`, 'order_id', NEW.`order_id`, 'shift_id', NEW.`shift_id`, 'cashier_id', NEW.`cashier_id`, 'reason', NEW.`reason`, 'amount', CAST(NEW.`amount` AS CHAR), 'total_cost_returned', CAST(NEW.`total_cost_returned` AS CHAR), 'is_admin_refund', NEW.`is_admin_refund`, 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_refunds_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_refunds_update` AFTER UPDATE ON `refunds` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`id` <=> NEW.`id`) OR NOT (OLD.`branch_id` <=> NEW.`branch_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('refunds', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('refunds', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'client_request_id', NEW.`client_request_id`, 'request_fingerprint', NEW.`request_fingerprint`, 'order_id', NEW.`order_id`, 'shift_id', NEW.`shift_id`, 'cashier_id', NEW.`cashier_id`, 'reason', NEW.`reason`, 'amount', CAST(NEW.`amount` AS CHAR), 'total_cost_returned', CAST(NEW.`total_cost_returned` AS CHAR), 'is_admin_refund', NEW.`is_admin_refund`, 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_refunds_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_refunds_delete` AFTER DELETE ON `refunds` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('refunds', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_salary_adjustments_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_salary_adjustments_insert` AFTER INSERT ON `salary_adjustments` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('salary_adjustments', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'employee_id', NEW.`employee_id`, 'type', NEW.`type`, 'amount', CAST(NEW.`amount` AS CHAR), 'entry_date', NEW.`entry_date`, 'note', NEW.`note`, 'recorded_by', NEW.`recorded_by`, 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_salary_adjustments_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_salary_adjustments_update` AFTER UPDATE ON `salary_adjustments` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`id` <=> NEW.`id`) OR NOT (OLD.`branch_id` <=> NEW.`branch_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('salary_adjustments', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('salary_adjustments', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'employee_id', NEW.`employee_id`, 'type', NEW.`type`, 'amount', CAST(NEW.`amount` AS CHAR), 'entry_date', NEW.`entry_date`, 'note', NEW.`note`, 'recorded_by', NEW.`recorded_by`, 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_salary_adjustments_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_salary_adjustments_delete` AFTER DELETE ON `salary_adjustments` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('salary_adjustments', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_salary_advances_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_salary_advances_insert` AFTER INSERT ON `salary_advances` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('salary_advances', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'employee_id', NEW.`employee_id`, 'amount', CAST(NEW.`amount` AS CHAR), 'entry_date', NEW.`entry_date`, 'note', NEW.`note`, 'recorded_by', NEW.`recorded_by`, 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_salary_advances_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_salary_advances_update` AFTER UPDATE ON `salary_advances` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`id` <=> NEW.`id`) OR NOT (OLD.`branch_id` <=> NEW.`branch_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('salary_advances', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('salary_advances', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'employee_id', NEW.`employee_id`, 'amount', CAST(NEW.`amount` AS CHAR), 'entry_date', NEW.`entry_date`, 'note', NEW.`note`, 'recorded_by', NEW.`recorded_by`, 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_salary_advances_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_salary_advances_delete` AFTER DELETE ON `salary_advances` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('salary_advances', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_salary_payments_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_salary_payments_insert` AFTER INSERT ON `salary_payments` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('salary_payments', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'employee_id', NEW.`employee_id`, 'period_month', NEW.`period_month`, 'base_pay', CAST(NEW.`base_pay` AS CHAR), 'bonuses', CAST(NEW.`bonuses` AS CHAR), 'deductions', CAST(NEW.`deductions` AS CHAR), 'advances', CAST(NEW.`advances` AS CHAR), 'net_pay', CAST(NEW.`net_pay` AS CHAR), 'paid_by', NEW.`paid_by`, 'paid_at', CAST(NEW.`paid_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_salary_payments_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_salary_payments_update` AFTER UPDATE ON `salary_payments` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`id` <=> NEW.`id`) OR NOT (OLD.`branch_id` <=> NEW.`branch_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('salary_payments', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('salary_payments', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'employee_id', NEW.`employee_id`, 'period_month', NEW.`period_month`, 'base_pay', CAST(NEW.`base_pay` AS CHAR), 'bonuses', CAST(NEW.`bonuses` AS CHAR), 'deductions', CAST(NEW.`deductions` AS CHAR), 'advances', CAST(NEW.`advances` AS CHAR), 'net_pay', CAST(NEW.`net_pay` AS CHAR), 'paid_by', NEW.`paid_by`, 'paid_at', CAST(NEW.`paid_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_salary_payments_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_salary_payments_delete` AFTER DELETE ON `salary_payments` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('salary_payments', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_shift_events_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_shift_events_insert` AFTER INSERT ON `shift_events` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('shift_events', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'shift_id', NEW.`shift_id`, 'action', NEW.`action`, 'actor_user_id', NEW.`actor_user_id`, 'note', NEW.`note`, 'opening_float', CAST(NEW.`opening_float` AS CHAR), 'actual_cash', CAST(NEW.`actual_cash` AS CHAR), 'expected_cash', CAST(NEW.`expected_cash` AS CHAR), 'over_short', CAST(NEW.`over_short` AS CHAR), 'occurred_at', CAST(NEW.`occurred_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_shift_events_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_shift_events_update` AFTER UPDATE ON `shift_events` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`id` <=> NEW.`id`) OR NOT (OLD.`branch_id` <=> NEW.`branch_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('shift_events', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('shift_events', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'shift_id', NEW.`shift_id`, 'action', NEW.`action`, 'actor_user_id', NEW.`actor_user_id`, 'note', NEW.`note`, 'opening_float', CAST(NEW.`opening_float` AS CHAR), 'actual_cash', CAST(NEW.`actual_cash` AS CHAR), 'expected_cash', CAST(NEW.`expected_cash` AS CHAR), 'over_short', CAST(NEW.`over_short` AS CHAR), 'occurred_at', CAST(NEW.`occurred_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_shift_events_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_shift_events_delete` AFTER DELETE ON `shift_events` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('shift_events', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_shifts_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_shifts_insert` AFTER INSERT ON `shifts` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('shifts', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'cashier_user_id', NEW.`cashier_user_id`, 'employee_id', NEW.`employee_id`, 'status', NEW.`status`, 'open_slot', NEW.`open_slot`, 'opening_float', CAST(NEW.`opening_float` AS CHAR), 'opened_at', CAST(NEW.`opened_at` AS CHAR), 'closed_at', CAST(NEW.`closed_at` AS CHAR), 'closed_by_user_id', NEW.`closed_by_user_id`, 'actual_cash', CAST(NEW.`actual_cash` AS CHAR), 'expected_cash', CAST(NEW.`expected_cash` AS CHAR), 'over_short', CAST(NEW.`over_short` AS CHAR), 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_shifts_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_shifts_update` AFTER UPDATE ON `shifts` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`id` <=> NEW.`id`) OR NOT (OLD.`branch_id` <=> NEW.`branch_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('shifts', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('shifts', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'cashier_user_id', NEW.`cashier_user_id`, 'employee_id', NEW.`employee_id`, 'status', NEW.`status`, 'open_slot', NEW.`open_slot`, 'opening_float', CAST(NEW.`opening_float` AS CHAR), 'opened_at', CAST(NEW.`opened_at` AS CHAR), 'closed_at', CAST(NEW.`closed_at` AS CHAR), 'closed_by_user_id', NEW.`closed_by_user_id`, 'actual_cash', CAST(NEW.`actual_cash` AS CHAR), 'expected_cash', CAST(NEW.`expected_cash` AS CHAR), 'over_short', CAST(NEW.`over_short` AS CHAR), 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_shifts_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_shifts_delete` AFTER DELETE ON `shifts` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('shifts', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_stock_batches_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_stock_batches_insert` AFTER INSERT ON `stock_batches` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('stock_batches', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'item_id', NEW.`item_id`, 'warehouse', NEW.`warehouse`, 'initial_quantity', CAST(NEW.`initial_quantity` AS CHAR), 'remaining_quantity', CAST(NEW.`remaining_quantity` AS CHAR), 'unit_cost', CAST(NEW.`unit_cost` AS CHAR), 'received_at', CAST(NEW.`received_at` AS CHAR), 'source_type', NEW.`source_type`, 'source_id', NEW.`source_id`, 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_stock_batches_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_stock_batches_update` AFTER UPDATE ON `stock_batches` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`id` <=> NEW.`id`) OR NOT (OLD.`branch_id` <=> NEW.`branch_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('stock_batches', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('stock_batches', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'item_id', NEW.`item_id`, 'warehouse', NEW.`warehouse`, 'initial_quantity', CAST(NEW.`initial_quantity` AS CHAR), 'remaining_quantity', CAST(NEW.`remaining_quantity` AS CHAR), 'unit_cost', CAST(NEW.`unit_cost` AS CHAR), 'received_at', CAST(NEW.`received_at` AS CHAR), 'source_type', NEW.`source_type`, 'source_id', NEW.`source_id`, 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_stock_batches_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_stock_batches_delete` AFTER DELETE ON `stock_batches` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('stock_batches', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_stock_deficit_allocations_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_stock_deficit_allocations_insert` AFTER INSERT ON `stock_deficit_allocations` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('stock_deficit_allocations', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'deficit_movement_id', NEW.`deficit_movement_id`, 'batch_id', NEW.`batch_id`, 'quantity', CAST(NEW.`quantity` AS CHAR), 'unit_cost', CAST(NEW.`unit_cost` AS CHAR), 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_stock_deficit_allocations_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_stock_deficit_allocations_update` AFTER UPDATE ON `stock_deficit_allocations` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`id` <=> NEW.`id`) OR NOT (OLD.`branch_id` <=> NEW.`branch_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('stock_deficit_allocations', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('stock_deficit_allocations', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'deficit_movement_id', NEW.`deficit_movement_id`, 'batch_id', NEW.`batch_id`, 'quantity', CAST(NEW.`quantity` AS CHAR), 'unit_cost', CAST(NEW.`unit_cost` AS CHAR), 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_stock_deficit_allocations_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_stock_deficit_allocations_delete` AFTER DELETE ON `stock_deficit_allocations` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('stock_deficit_allocations', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_stock_movements_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_stock_movements_insert` AFTER INSERT ON `stock_movements` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('stock_movements', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'item_id', NEW.`item_id`, 'warehouse', NEW.`warehouse`, 'batch_id', NEW.`batch_id`, 'movement_type', NEW.`movement_type`, 'quantity', CAST(NEW.`quantity` AS CHAR), 'unit_cost', CAST(NEW.`unit_cost` AS CHAR), 'reference_type', NEW.`reference_type`, 'reference_id', NEW.`reference_id`, 'notes', NEW.`notes`, 'occurred_at', CAST(NEW.`occurred_at` AS CHAR), 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_stock_movements_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_stock_movements_update` AFTER UPDATE ON `stock_movements` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`id` <=> NEW.`id`) OR NOT (OLD.`branch_id` <=> NEW.`branch_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('stock_movements', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('stock_movements', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'item_id', NEW.`item_id`, 'warehouse', NEW.`warehouse`, 'batch_id', NEW.`batch_id`, 'movement_type', NEW.`movement_type`, 'quantity', CAST(NEW.`quantity` AS CHAR), 'unit_cost', CAST(NEW.`unit_cost` AS CHAR), 'reference_type', NEW.`reference_type`, 'reference_id', NEW.`reference_id`, 'notes', NEW.`notes`, 'occurred_at', CAST(NEW.`occurred_at` AS CHAR), 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_stock_movements_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_stock_movements_delete` AFTER DELETE ON `stock_movements` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('stock_movements', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_stocktake_lines_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_stocktake_lines_insert` AFTER INSERT ON `stocktake_lines` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('stocktake_lines', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'stocktake_id', NEW.`stocktake_id`, 'item_id', NEW.`item_id`, 'recorded_quantity', CAST(NEW.`recorded_quantity` AS CHAR), 'counted_quantity', CAST(NEW.`counted_quantity` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_stocktake_lines_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_stocktake_lines_update` AFTER UPDATE ON `stocktake_lines` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`id` <=> NEW.`id`) OR NOT (OLD.`branch_id` <=> NEW.`branch_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('stocktake_lines', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('stocktake_lines', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'stocktake_id', NEW.`stocktake_id`, 'item_id', NEW.`item_id`, 'recorded_quantity', CAST(NEW.`recorded_quantity` AS CHAR), 'counted_quantity', CAST(NEW.`counted_quantity` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_stocktake_lines_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_stocktake_lines_delete` AFTER DELETE ON `stocktake_lines` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('stocktake_lines', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_stocktakes_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_stocktakes_insert` AFTER INSERT ON `stocktakes` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('stocktakes', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'kind', NEW.`kind`, 'warehouse', NEW.`warehouse`, 'category_id', NEW.`category_id`, 'status', NEW.`status`, 'note', NEW.`note`, 'created_by', NEW.`created_by`, 'created_at', CAST(NEW.`created_at` AS CHAR), 'confirmed_at', CAST(NEW.`confirmed_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_stocktakes_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_stocktakes_update` AFTER UPDATE ON `stocktakes` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`id` <=> NEW.`id`) OR NOT (OLD.`branch_id` <=> NEW.`branch_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('stocktakes', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('stocktakes', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'kind', NEW.`kind`, 'warehouse', NEW.`warehouse`, 'category_id', NEW.`category_id`, 'status', NEW.`status`, 'note', NEW.`note`, 'created_by', NEW.`created_by`, 'created_at', CAST(NEW.`created_at` AS CHAR), 'confirmed_at', CAST(NEW.`confirmed_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_stocktakes_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_stocktakes_delete` AFTER DELETE ON `stocktakes` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('stocktakes', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_supplier_payments_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_supplier_payments_insert` AFTER INSERT ON `supplier_payments` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('supplier_payments', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'supplier_id', NEW.`supplier_id`, 'purchase_invoice_id', NEW.`purchase_invoice_id`, 'amount', CAST(NEW.`amount` AS CHAR), 'paid_at', NEW.`paid_at`, 'notes', NEW.`notes`, 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_supplier_payments_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_supplier_payments_update` AFTER UPDATE ON `supplier_payments` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`id` <=> NEW.`id`) OR NOT (OLD.`branch_id` <=> NEW.`branch_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('supplier_payments', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('supplier_payments', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'supplier_id', NEW.`supplier_id`, 'purchase_invoice_id', NEW.`purchase_invoice_id`, 'amount', CAST(NEW.`amount` AS CHAR), 'paid_at', NEW.`paid_at`, 'notes', NEW.`notes`, 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_supplier_payments_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_supplier_payments_delete` AFTER DELETE ON `supplier_payments` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('supplier_payments', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_suppliers_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_suppliers_insert` AFTER INSERT ON `suppliers` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('suppliers', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'name', NEW.`name`, 'phone', NEW.`phone`, 'address', NEW.`address`, 'notes', NEW.`notes`, 'opening_balance', CAST(NEW.`opening_balance` AS CHAR), 'is_active', NEW.`is_active`, 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_suppliers_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_suppliers_update` AFTER UPDATE ON `suppliers` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`id` <=> NEW.`id`) OR NOT (OLD.`branch_id` <=> NEW.`branch_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('suppliers', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('suppliers', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'name', NEW.`name`, 'phone', NEW.`phone`, 'address', NEW.`address`, 'notes', NEW.`notes`, 'opening_balance', CAST(NEW.`opening_balance` AS CHAR), 'is_active', NEW.`is_active`, 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_suppliers_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_suppliers_delete` AFTER DELETE ON `suppliers` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('suppliers', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_sync_outbox_insert`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_sync_outbox_update`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_sync_outbox_delete`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_sync_state_insert`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_sync_state_update`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_sync_state_delete`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_transfer_lines_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_transfer_lines_insert` AFTER INSERT ON `transfer_lines` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('transfer_lines', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'transfer_id', NEW.`transfer_id`, 'item_id', NEW.`item_id`, 'quantity', CAST(NEW.`quantity` AS CHAR), 'unit_cost', CAST(NEW.`unit_cost` AS CHAR), 'source_batch_id', NEW.`source_batch_id`, 'cafe_batch_id', NEW.`cafe_batch_id`));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_transfer_lines_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_transfer_lines_update` AFTER UPDATE ON `transfer_lines` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`id` <=> NEW.`id`) OR NOT (OLD.`branch_id` <=> NEW.`branch_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('transfer_lines', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('transfer_lines', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'transfer_id', NEW.`transfer_id`, 'item_id', NEW.`item_id`, 'quantity', CAST(NEW.`quantity` AS CHAR), 'unit_cost', CAST(NEW.`unit_cost` AS CHAR), 'source_batch_id', NEW.`source_batch_id`, 'cafe_batch_id', NEW.`cafe_batch_id`));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_transfer_lines_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_transfer_lines_delete` AFTER DELETE ON `transfer_lines` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('transfer_lines', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_transfer_request_lines_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_transfer_request_lines_insert` AFTER INSERT ON `transfer_request_lines` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('transfer_request_lines', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'request_id', NEW.`request_id`, 'item_id', NEW.`item_id`, 'quantity', CAST(NEW.`quantity` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_transfer_request_lines_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_transfer_request_lines_update` AFTER UPDATE ON `transfer_request_lines` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`id` <=> NEW.`id`) OR NOT (OLD.`branch_id` <=> NEW.`branch_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('transfer_request_lines', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('transfer_request_lines', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'request_id', NEW.`request_id`, 'item_id', NEW.`item_id`, 'quantity', CAST(NEW.`quantity` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_transfer_request_lines_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_transfer_request_lines_delete` AFTER DELETE ON `transfer_request_lines` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('transfer_request_lines', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_transfer_requests_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_transfer_requests_insert` AFTER INSERT ON `transfer_requests` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('transfer_requests', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'requested_by', NEW.`requested_by`, 'shift_id', NEW.`shift_id`, 'notes', NEW.`notes`, 'status', NEW.`status`, 'reviewed_by', NEW.`reviewed_by`, 'rejection_reason', NEW.`rejection_reason`, 'reviewed_at', CAST(NEW.`reviewed_at` AS CHAR), 'client_request_id', NEW.`client_request_id`, 'request_fingerprint', NEW.`request_fingerprint`, 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_transfer_requests_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_transfer_requests_update` AFTER UPDATE ON `transfer_requests` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`id` <=> NEW.`id`) OR NOT (OLD.`branch_id` <=> NEW.`branch_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('transfer_requests', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('transfer_requests', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'requested_by', NEW.`requested_by`, 'shift_id', NEW.`shift_id`, 'notes', NEW.`notes`, 'status', NEW.`status`, 'reviewed_by', NEW.`reviewed_by`, 'rejection_reason', NEW.`rejection_reason`, 'reviewed_at', CAST(NEW.`reviewed_at` AS CHAR), 'client_request_id', NEW.`client_request_id`, 'request_fingerprint', NEW.`request_fingerprint`, 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_transfer_requests_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_transfer_requests_delete` AFTER DELETE ON `transfer_requests` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('transfer_requests', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_transfers_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_transfers_insert` AFTER INSERT ON `transfers` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('transfers', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'request_id', NEW.`request_id`, 'purchase_invoice_id', NEW.`purchase_invoice_id`, 'created_by', NEW.`created_by`, 'approved_by', NEW.`approved_by`, 'notes', NEW.`notes`, 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_transfers_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_transfers_update` AFTER UPDATE ON `transfers` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`id` <=> NEW.`id`) OR NOT (OLD.`branch_id` <=> NEW.`branch_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('transfers', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('transfers', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'request_id', NEW.`request_id`, 'purchase_invoice_id', NEW.`purchase_invoice_id`, 'created_by', NEW.`created_by`, 'approved_by', NEW.`approved_by`, 'notes', NEW.`notes`, 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_transfers_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_transfers_delete` AFTER DELETE ON `transfers` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('transfers', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_users_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_users_insert` AFTER INSERT ON `users` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF NEW.`role` = 'cashier' THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('users', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`, 'employee_id', NEW.`employee_id`, 'name', NEW.`name`, 'username', NEW.`username`, 'password_hash', NEW.`password_hash`, 'token_version', NEW.`token_version`, 'role', NEW.`role`, 'is_active', NEW.`is_active`, 'is_super_admin', NEW.`is_super_admin`, 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_users_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_users_update` AFTER UPDATE ON `users` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF OLD.`role` = 'cashier' AND (NOT (OLD.`id` <=> NEW.`id`) OR NOT (OLD.`branch_id` <=> NEW.`branch_id`) OR NEW.`role` <> 'cashier') THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('users', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
    IF NEW.`role` = 'cashier' THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('users', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`, 'employee_id', NEW.`employee_id`, 'name', NEW.`name`, 'username', NEW.`username`, 'password_hash', NEW.`password_hash`, 'token_version', NEW.`token_version`, 'role', NEW.`role`, 'is_active', NEW.`is_active`, 'is_super_admin', NEW.`is_super_admin`, 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_users_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_users_delete` AFTER DELETE ON `users` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF OLD.`role` = 'cashier' THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('users', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_waste_allocations_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_waste_allocations_insert` AFTER INSERT ON `waste_allocations` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('waste_allocations', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'waste_entry_id', NEW.`waste_entry_id`, 'item_id', NEW.`item_id`, 'item_name', NEW.`item_name`, 'batch_id', NEW.`batch_id`, 'stock_movement_id', NEW.`stock_movement_id`, 'quantity', CAST(NEW.`quantity` AS CHAR), 'unit_cost', CAST(NEW.`unit_cost` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_waste_allocations_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_waste_allocations_update` AFTER UPDATE ON `waste_allocations` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`id` <=> NEW.`id`) OR NOT (OLD.`branch_id` <=> NEW.`branch_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('waste_allocations', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('waste_allocations', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'waste_entry_id', NEW.`waste_entry_id`, 'item_id', NEW.`item_id`, 'item_name', NEW.`item_name`, 'batch_id', NEW.`batch_id`, 'stock_movement_id', NEW.`stock_movement_id`, 'quantity', CAST(NEW.`quantity` AS CHAR), 'unit_cost', CAST(NEW.`unit_cost` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_waste_allocations_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_waste_allocations_delete` AFTER DELETE ON `waste_allocations` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('waste_allocations', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_waste_entries_insert`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_waste_entries_insert` AFTER INSERT ON `waste_entries` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('waste_entries', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'client_request_id', NEW.`client_request_id`, 'request_fingerprint', NEW.`request_fingerprint`, 'shift_id', NEW.`shift_id`, 'warehouse', NEW.`warehouse`, 'target_type', NEW.`target_type`, 'item_id', NEW.`item_id`, 'recipe_id', NEW.`recipe_id`, 'recipe_size_id', NEW.`recipe_size_id`, 'external_product_id', NEW.`external_product_id`, 'external_size_id', NEW.`external_size_id`, 'target_name', NEW.`target_name`, 'size_name', NEW.`size_name`, 'quantity', CAST(NEW.`quantity` AS CHAR), 'reason', NEW.`reason`, 'reason_code', NEW.`reason_code`, 'note', NEW.`note`, 'total_cost', CAST(NEW.`total_cost` AS CHAR), 'recorded_by', NEW.`recorded_by`, 'refund_line_id', NEW.`refund_line_id`, 'occurred_at', CAST(NEW.`occurred_at` AS CHAR), 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_waste_entries_update`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_waste_entries_update` AFTER UPDATE ON `waste_entries` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE AND (NOT (OLD.`id` <=> NEW.`id`) OR NOT (OLD.`branch_id` <=> NEW.`branch_id`)) THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('waste_entries', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('waste_entries', 'upsert', JSON_OBJECT('id', NEW.`id`, 'branch_id', NEW.`branch_id`), JSON_OBJECT('branch_id', NEW.`branch_id`, 'id', NEW.`id`, 'client_request_id', NEW.`client_request_id`, 'request_fingerprint', NEW.`request_fingerprint`, 'shift_id', NEW.`shift_id`, 'warehouse', NEW.`warehouse`, 'target_type', NEW.`target_type`, 'item_id', NEW.`item_id`, 'recipe_id', NEW.`recipe_id`, 'recipe_size_id', NEW.`recipe_size_id`, 'external_product_id', NEW.`external_product_id`, 'external_size_id', NEW.`external_size_id`, 'target_name', NEW.`target_name`, 'size_name', NEW.`size_name`, 'quantity', CAST(NEW.`quantity` AS CHAR), 'reason', NEW.`reason`, 'reason_code', NEW.`reason_code`, 'note', NEW.`note`, 'total_cost', CAST(NEW.`total_cost` AS CHAR), 'recorded_by', NEW.`recorded_by`, 'refund_line_id', NEW.`refund_line_id`, 'occurred_at', CAST(NEW.`occurred_at` AS CHAR), 'created_at', CAST(NEW.`created_at` AS CHAR)));
    END IF;
  END IF;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `cashier_sync_waste_entries_delete`;
--> statement-breakpoint
CREATE TRIGGER `cashier_sync_waste_entries_delete` AFTER DELETE ON `waste_entries` FOR EACH ROW
BEGIN
  IF @cashier_sync_apply IS NULL OR @cashier_sync_apply = 0 THEN
    IF TRUE THEN
      INSERT INTO `sync_outbox` (`table_name`, `op`, `pk`, `row_json`) VALUES ('waste_entries', 'delete', JSON_OBJECT('id', OLD.`id`, 'branch_id', OLD.`branch_id`), NULL);
    END IF;
  END IF;
END;
