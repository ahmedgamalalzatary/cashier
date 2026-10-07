-- payroll is monthly only: a daily/hourly rate is not a monthly salary, so it
-- is cleared and the admin re-enters it as a monthly amount (NULL pay_type
-- rows already mean monthly or unset and keep their rate)
UPDATE `employees` SET `pay_rate` = NULL WHERE `pay_type` <> 'monthly';--> statement-breakpoint
ALTER TABLE `employees` DROP COLUMN `pay_type`;