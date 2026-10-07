-- Adds the system-assigned item code. Each DDL statement below commits
-- implicitly, so the migration is not atomic; every step is written to be
-- re-runnable in case it dies part-way and has to be replayed.
SET @add_code = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `items` ADD `code` int',
    'DO 0'
  )
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'items'
    AND column_name = 'code'
);--> statement-breakpoint
PREPARE add_code FROM @add_code;--> statement-breakpoint
EXECUTE add_code;--> statement-breakpoint
DEALLOCATE PREPARE add_code;--> statement-breakpoint
-- resume from the highest code already assigned, so a replayed backfill does
-- not hand out numbers a previous partial run already used
SET @item_code = (SELECT COALESCE(MAX(`code`), 0) FROM `items`);--> statement-breakpoint
UPDATE `items` SET `code` = (@item_code := @item_code + 1) WHERE `code` IS NULL ORDER BY `id`;--> statement-breakpoint
ALTER TABLE `items` MODIFY `code` int NOT NULL;--> statement-breakpoint
SET @add_uidx = (
  SELECT IF(
    COUNT(*) = 0,
    'ALTER TABLE `items` ADD CONSTRAINT `items_code_uidx` UNIQUE(`code`)',
    'DO 0'
  )
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'items'
    AND index_name = 'items_code_uidx'
);--> statement-breakpoint
PREPARE add_uidx FROM @add_uidx;--> statement-breakpoint
EXECUTE add_uidx;--> statement-breakpoint
DEALLOCATE PREPARE add_uidx;
