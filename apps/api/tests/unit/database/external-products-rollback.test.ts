import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  path.resolve(import.meta.dirname, "../../../drizzle/0033_majestic_timeslip.sql"),
  "utf8",
);

describe("external products rollback migration", () => {
  it("disposes dependent external-product rows before narrowing enums", () => {
    const enumNarrowing = migration.indexOf(
      "ALTER TABLE `order_lines` MODIFY COLUMN `type` enum('recipe','item')",
    );

    expect(enumNarrowing).toBeGreaterThan(-1);
    for (const deletion of [
      "DELETE FROM `waste_allocations`",
      "DELETE FROM `waste_entries`",
      "DELETE FROM `refund_line_allocations`",
      "DELETE FROM `refund_lines`",
      "DELETE FROM `order_line_allocations`",
      "DELETE FROM `order_lines`",
    ]) {
      const position = migration.indexOf(deletion);
      expect(position, deletion).toBeGreaterThan(-1);
      expect(position, deletion).toBeLessThan(enumNarrowing);
    }
    expect(migration.indexOf("DELETE FROM `waste_allocations`")).toBeLessThan(
      migration.indexOf("DELETE FROM `waste_entries`"),
    );
  });

  it("renames the retained refresh state for external orders", () => {
    expect(migration).toContain(
      "RENAME TABLE `external_catalog_sync` TO `external_orders_sync`",
    );
  });

  it("removes empty refund and order headers after their external lines", () => {
    const refundLines = migration.indexOf(
      "DELETE FROM `refund_lines` WHERE `type` = 'external_product'",
    );
    const refunds = migration.indexOf("DELETE FROM `refunds`");
    const orderLines = migration.indexOf(
      "DELETE FROM `order_lines` WHERE `type` = 'external_product'",
    );
    const orders = migration.indexOf("DELETE FROM `orders`");

    expect(refunds).toBeGreaterThan(refundLines);
    expect(orders).toBeGreaterThan(orderLines);
    expect(orders).toBeGreaterThan(refunds);
  });
});
