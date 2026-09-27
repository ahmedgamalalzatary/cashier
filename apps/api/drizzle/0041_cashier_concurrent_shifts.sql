ALTER TABLE `shifts` DROP INDEX `shifts_open_slot_uidx`, ADD CONSTRAINT `shifts_open_slot_uidx` UNIQUE(`cashier_user_id`,`open_slot`);
