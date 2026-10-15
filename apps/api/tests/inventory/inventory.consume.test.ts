import { testId } from "@cashier/shared/test-support";
import { describe, expect, it } from "vitest";
import { InventoryService } from "../../src/modules/inventory/inventory.service.js";
import { FakeInventoryRepository } from "./support/fake-inventory-repository.js";

describe("inventory consumption", () => {
  it("consumes the oldest batches first and returns the FIFO cost", async () => {
    const repo = new FakeInventoryRepository();
    repo.batches = [
      {
        id: testId(1),
        itemId: testId(1),
        warehouse: "main",
        initialQuantity: "2.000",
        remainingQuantity: "2.000",
        unitCost: "10.000000",
        receivedAt: new Date("2026-07-01T00:00:00Z"),
        sourceType: "purchase",
        sourceId: testId(1),
      },
      {
        id: testId(2),
        itemId: testId(1),
        warehouse: "main",
        initialQuantity: "5.000",
        remainingQuantity: "5.000",
        unitCost: "12.000000",
        receivedAt: new Date("2026-07-02T00:00:00Z"),
        sourceType: "purchase",
        sourceId: testId(2),
      },
    ];
    const service = new InventoryService(repo);

    const result = await service.consume({
      itemId: testId(1),
      warehouse: "main",
      quantity: 4,
      movementType: "transfer_out",
      referenceType: "transfer",
      referenceId: testId(9),
    });

    expect(repo.batches.map((batch) => batch.remainingQuantity)).toEqual([
      "0.000",
      "3.000",
    ]);
    expect(repo.movements.map((movement) => movement.quantity)).toEqual([
      "-2.000",
      "-2.000",
    ]);
    expect(result).toEqual({
      quantity: "4.000",
      totalCost: "44.000000",
      allocations: [
        {
          batchId: testId(1),
          movementId: testId(1),
          quantity: "2.000",
          unitCost: "10.000000",
        },
        {
          batchId: testId(2),
          movementId: testId(2),
          quantity: "2.000",
          unitCost: "12.000000",
        },
      ],
    });
  });

  it("rolls back all batch changes when stock is insufficient", async () => {
    const repo = new FakeInventoryRepository();
    repo.batches = [
      {
        id: testId(1),
        itemId: testId(1),
        warehouse: "main",
        initialQuantity: "2.000",
        remainingQuantity: "2.000",
        unitCost: "10.000000",
        receivedAt: new Date("2026-07-01T00:00:00Z"),
        sourceType: "purchase",
        sourceId: testId(1),
      },
    ];
    const service = new InventoryService(repo);

    await expect(
      service.consume({
        itemId: testId(1),
        warehouse: "main",
        quantity: 3,
        movementType: "transfer_out",
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(repo.batches[0].remainingQuantity).toBe("2.000");
    expect(repo.movements).toHaveLength(0);
  });

  it("records an uncosted shortfall when negative stock is explicitly allowed", async () => {
    const repo = new FakeInventoryRepository();
    repo.batches = [
      {
        id: testId(1),
        itemId: testId(1),
        warehouse: "cafe",
        initialQuantity: "1.000",
        remainingQuantity: "1.000",
        unitCost: "8.000000",
        receivedAt: new Date("2026-07-01T00:00:00Z"),
        sourceType: "transfer_in",
        sourceId: testId(1),
      },
    ];
    const service = new InventoryService(repo);

    const result = await service.consume({
      itemId: testId(1),
      warehouse: "cafe",
      quantity: 2,
      movementType: "sale",
      allowNegative: true,
    });

    expect(repo.movements).toHaveLength(2);
    expect(repo.movements[1]).toMatchObject({
      batchId: null,
      quantity: "-1.000",
      unitCost: "0.000000",
    });
    expect(result).toEqual({
      quantity: "2.000",
      totalCost: "8.000000",
      allocations: [
        {
          batchId: testId(1),
          movementId: testId(1),
          quantity: "1.000",
          unitCost: "8.000000",
        },
        {
          batchId: null,
          movementId: testId(2),
          quantity: "1.000",
          unitCost: "0.000000",
        },
      ],
    });
  });

  it("costs an allowed shortfall at the given unit cost", async () => {
    const repo = new FakeInventoryRepository();
    repo.batches = [
      {
        id: testId(1),
        itemId: testId(1),
        warehouse: "main",
        initialQuantity: "1.000",
        remainingQuantity: "1.000",
        unitCost: "8.000000",
        receivedAt: new Date("2026-07-01T00:00:00Z"),
        sourceType: "purchase",
        sourceId: testId(1),
      },
    ];
    const service = new InventoryService(repo);

    const result = await service.consume({
      itemId: testId(1),
      warehouse: "main",
      quantity: 3,
      movementType: "transfer_out",
      allowNegative: true,
      shortfallUnitCost: "7.5",
    });

    expect(repo.movements[1]).toMatchObject({
      batchId: null,
      quantity: "-2.000",
      unitCost: "7.500000",
    });
    expect(result.allocations).toEqual([
      {
        batchId: testId(1),
        movementId: testId(1),
        quantity: "1.000",
        unitCost: "8.000000",
      },
      {
        batchId: null,
        movementId: testId(2),
        quantity: "2.000",
        unitCost: "7.500000",
      },
    ]);
  });

  it("still costs a sale shortfall at zero when no cost is given", async () => {
    const repo = new FakeInventoryRepository();
    const service = new InventoryService(repo);

    const result = await service.consume({
      itemId: testId(1),
      warehouse: "cafe",
      quantity: 2,
      movementType: "sale",
      allowNegative: true,
    });

    expect(repo.movements[0]).toMatchObject({
      batchId: null,
      unitCost: "0.000000",
    });
    expect(result.allocations[0]).toMatchObject({
      batchId: null,
      unitCost: "0.000000",
    });
  });
});
