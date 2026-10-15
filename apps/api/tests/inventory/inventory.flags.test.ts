import { testId } from "@cashier/shared/test-support";
import { describe, expect, it } from "vitest";
import { InventoryService } from "../../src/modules/inventory/inventory.service.js";
import { FakeInventoryRepository } from "./support/fake-inventory-repository.js";

describe("inventory deficit and stock flags", () => {
  const deficitMovement = (quantity: string) => ({
    itemId: testId(1),
    warehouse: "cafe" as const,
    batchId: null,
    movementType: "sale",
    quantity,
    unitCost: "0.000000",
    referenceType: null,
    referenceId: null,
    notes: null,
    occurredAt: new Date("2026-07-01T00:00:00Z"),
  });

  it("splits incoming stock across several outstanding deficits", async () => {
    const repo = new FakeInventoryRepository();
    repo.movements.push(deficitMovement("-1.000"), deficitMovement("-2.000"));
    const service = new InventoryService(repo);

    const result = await service.receive({
      itemId: testId(1),
      warehouse: "cafe",
      quantity: 2,
      unitCost: "8",
      movementType: "transfer_in",
    });

    expect(repo.batches[0]).toMatchObject({
      initialQuantity: "2.000",
      remainingQuantity: "0.000",
    });
    expect(result.deficitAllocations).toEqual([
      {
        deficitMovementId: testId(1),
        batchId: testId(1),
        quantity: "1.000",
        unitCost: "8.000000",
      },
      {
        deficitMovementId: testId(2),
        batchId: testId(1),
        quantity: "1.000",
        unitCost: "8.000000",
      },
    ]);
  });

  it("flags low and negative stock levels", async () => {
    const repo = new FakeInventoryRepository();
    const row = (overrides: Record<string, unknown>) => ({
      itemId: testId(1),
      code: 1001,
      name: "بن",
      categoryId: testId(1),
      categoryName: "خامات",
      type: "raw",
      stockUnit: "كجم",
      isActive: true,
      quantity: "10.000",
      stockValue: "20.00",
      minimumLevel: "5.000",
      ...overrides,
    });
    repo.listStock = (async () => [
      row({ quantity: "2.000" }),
      row({ quantity: "10.000" }),
      row({ quantity: "1.000", isActive: false }),
      row({ quantity: "0.000", minimumLevel: "0.000" }),
      row({ quantity: "-1.000" }),
    ]) as typeof repo.listStock;
    const service = new InventoryService(repo);

    const rows = await service.listStock("cafe");

    expect(rows.map((candidate) => candidate.isLowStock)).toEqual([
      true,
      false,
      false,
      false,
      true,
    ]);
    expect(rows.map((candidate) => candidate.isNegativeStock)).toEqual([
      false,
      false,
      false,
      false,
      true,
    ]);
  });
});
