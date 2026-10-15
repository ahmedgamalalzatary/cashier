import { testId } from "@cashier/shared/test-support";
import { describe, expect, it } from "vitest";
import { InventoryService } from "../../src/modules/inventory/inventory.service.js";
import { FakeInventoryRepository } from "./support/fake-inventory-repository.js";

describe("inventory receiving", () => {
  it("receives stock as one batch and one positive movement", async () => {
    const repo = new FakeInventoryRepository();
    const service = new InventoryService(repo);

    const result = await service.receive({
      itemId: testId(1),
      warehouse: "main",
      quantity: 3.5,
      unitCost: "4.25",
      movementType: "purchase",
      referenceType: "purchase_invoice",
      referenceId: testId(7),
    });

    expect(result).toEqual({ batchId: testId(1), deficitAllocations: [] });
    expect(repo.batches[0]).toMatchObject({
      initialQuantity: "3.500",
      remainingQuantity: "3.500",
      unitCost: "4.250000",
    });
    expect(repo.movements[0]).toMatchObject({
      batchId: testId(1),
      quantity: "3.500",
      unitCost: "4.250000",
    });
  });

  it("accepts a zero unit cost for correction stock", async () => {
    const repo = new FakeInventoryRepository();
    const service = new InventoryService(repo);

    await expect(
      service.receive({
        itemId: testId(1),
        warehouse: "main",
        quantity: 1,
        unitCost: "0",
        movementType: "stocktake_surplus",
      }),
    ).resolves.toEqual({ batchId: testId(1), deficitAllocations: [] });
    expect(repo.batches[0].unitCost).toBe("0.000000");
  });

  it("uses incoming stock to reconcile an earlier negative balance", async () => {
    const repo = new FakeInventoryRepository();
    repo.movements.push({
      itemId: testId(1),
      warehouse: "cafe",
      batchId: null,
      movementType: "sale",
      quantity: "-1.000",
      unitCost: "0.000000",
      referenceType: null,
      referenceId: null,
      notes: null,
      occurredAt: new Date("2026-07-01T00:00:00Z"),
    });
    const service = new InventoryService(repo);

    await service.receive({
      itemId: testId(1),
      warehouse: "cafe",
      quantity: 3,
      unitCost: "8",
      movementType: "transfer_in",
    });

    expect(repo.batches[0]).toMatchObject({
      initialQuantity: "3.000",
      remainingQuantity: "2.000",
    });
    expect(repo.deficitAllocations).toEqual([
      {
        deficitMovementId: testId(1),
        batchId: testId(1),
        quantity: "1.000",
        unitCost: "8.000000",
      },
    ]);
    // the earlier sale now knows its real cost
    expect(repo.refreshedSaleCosts).toEqual([[testId(1)]]);
  });

  it("refreshes no sale cost when nothing was owed", async () => {
    const repo = new FakeInventoryRepository();
    await new InventoryService(repo).receive({
      itemId: testId(1),
      warehouse: "cafe",
      quantity: 1,
      unitCost: "8",
      movementType: "transfer_in",
    });
    expect(repo.refreshedSaleCosts).toEqual([]);
  });

  it("preserves exact maximum costs and rejects database overflow", async () => {
    const repo = new FakeInventoryRepository();
    const service = new InventoryService(repo);

    await service.receive({
      itemId: testId(1),
      warehouse: "main",
      quantity: 1,
      unitCost: "9999999999.999999",
      movementType: "purchase",
    });
    expect(repo.batches[0].unitCost).toBe("9999999999.999999");

    await expect(
      service.receive({
        itemId: testId(1),
        warehouse: "main",
        quantity: 1,
        unitCost: "10000000000.000000",
        movementType: "purchase",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rolls back several session operations with their outer transaction", async () => {
    const repo = new FakeInventoryRepository();
    const service = new InventoryService(repo);

    await expect(
      service.transaction(async (inventory) => {
        await inventory.receive({
          itemId: testId(1),
          warehouse: "main",
          quantity: 2,
          unitCost: "5",
          movementType: "purchase",
        });
        await inventory.consume({
          itemId: testId(1),
          warehouse: "main",
          quantity: 1,
          movementType: "transfer_out",
        });
        throw new Error("document write failed");
      }),
    ).rejects.toThrow("document write failed");
    expect(repo.batches).toHaveLength(0);
    expect(repo.movements).toHaveLength(0);
  });
});
