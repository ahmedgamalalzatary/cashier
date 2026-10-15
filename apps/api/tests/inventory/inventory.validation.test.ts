import { testId } from "@cashier/shared/test-support";
import { describe, expect, it } from "vitest";
import { InventoryService } from "../../src/modules/inventory/inventory.service.js";
import { FakeInventoryRepository } from "./support/fake-inventory-repository.js";

describe("inventory input validation", () => {
  const baseReceive = {
    itemId: testId(1),
    warehouse: "main" as const,
    quantity: 1,
    unitCost: "5",
    movementType: "purchase",
  };

  it("rejects zero, negative, non-finite, and over-precise quantities", async () => {
    const repo = new FakeInventoryRepository();
    const service = new InventoryService(repo);

    for (const quantity of [0, -1, NaN, Infinity, 100_000_000_000, 1.0005]) {
      await expect(
        service.receive({ ...baseReceive, quantity }),
      ).rejects.toMatchObject({ status: 400 });
    }
    await expect(
      service.consume({
        itemId: testId(1),
        warehouse: "main",
        quantity: 1.0005,
        movementType: "sale",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects malformed and out-of-range unit costs", async () => {
    const repo = new FakeInventoryRepository();
    const service = new InventoryService(repo);

    for (const unitCost of ["-1", "abc", "", "1.1234567", "12.34.56"]) {
      await expect(
        service.receive({ ...baseReceive, unitCost }),
      ).rejects.toMatchObject({ status: 400 });
    }
  });
});

describe("inventory item guards", () => {
  it("404s a missing item and 409s an inactive one", async () => {
    const missing = new FakeInventoryRepository();
    missing.items.delete(testId(1));
    await expect(
      new InventoryService(missing).receive({
        itemId: testId(1),
        warehouse: "main",
        quantity: 1,
        unitCost: "5",
        movementType: "purchase",
      }),
    ).rejects.toMatchObject({ status: 404 });

    const inactive = new FakeInventoryRepository();
    inactive.items.set(testId(1), { id: testId(1), isActive: false });
    await expect(
      new InventoryService(inactive).consume({
        itemId: testId(1),
        warehouse: "main",
        quantity: 1,
        movementType: "sale",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});
