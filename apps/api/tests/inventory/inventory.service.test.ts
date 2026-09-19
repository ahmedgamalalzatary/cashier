import { describe, expect, it } from "vitest";
import { InventoryService } from "../../src/modules/inventory/inventory.service.js";
import type {
  InventoryRepositoryPort,
  StockBatchRecord,
  StockMovementWrite,
} from "../../src/modules/inventory/inventory.repository.js";

type ItemRecord = { id: number; isActive: boolean };

class FakeInventoryRepository implements InventoryRepositoryPort {
  items = new Map<number, ItemRecord>([[1, { id: 1, isActive: true }]]);
  batches: StockBatchRecord[] = [];
  movements: StockMovementWrite[] = [];
  deficitAllocations: Array<{
    deficitMovementId: number;
    batchId: number;
    quantity: string;
    unitCost: string;
  }> = [];
  private nextBatchId = 1;

  async transaction<T>(fn: (repo: InventoryRepositoryPort) => Promise<T>) {
    const transaction = new FakeInventoryRepository();
    transaction.items = new Map(this.items);
    transaction.batches = structuredClone(this.batches);
    transaction.movements = structuredClone(this.movements);
    transaction.deficitAllocations = structuredClone(this.deficitAllocations);
    transaction.nextBatchId = this.nextBatchId;
    const result = await fn(transaction);
    this.items = transaction.items;
    this.batches = transaction.batches;
    this.movements = transaction.movements;
    this.deficitAllocations = transaction.deficitAllocations;
    this.nextBatchId = transaction.nextBatchId;
    return result;
  }

  async findItemForUpdate(id: number) {
    return this.items.get(id);
  }

  async createBatch(data: Omit<StockBatchRecord, "id">) {
    const id = this.nextBatchId++;
    this.batches.push({ id, ...data });
    return id;
  }

  async createMovement(data: StockMovementWrite) {
    this.movements.push(data);
    return this.movements.length;
  }

  async outstandingDeficits(itemId: number, warehouse: "main" | "cafe") {
    return this.movements.flatMap((movement, index) => {
      if (
        movement.itemId !== itemId ||
        movement.warehouse !== warehouse ||
        movement.batchId !== null ||
        Number(movement.quantity) >= 0
      )
        return [];
      const movementId = index + 1;
      const allocated = this.deficitAllocations
        .filter((allocation) => allocation.deficitMovementId === movementId)
        .reduce((sum, allocation) => sum + Number(allocation.quantity), 0);
      const remaining = -Number(movement.quantity) - allocated;
      return remaining > 0
        ? [{ movementId, remainingQuantity: remaining.toFixed(3) }]
        : [];
    });
  }

  async createDeficitAllocation(data: {
    deficitMovementId: number;
    batchId: number;
    quantity: string;
    unitCost: string;
  }) {
    this.deficitAllocations.push(data);
  }

  async lockAvailableBatches(itemId: number, warehouse: "main" | "cafe") {
    return this.batches.filter(
      (batch) =>
        batch.itemId === itemId &&
        batch.warehouse === warehouse &&
        Number(batch.remainingQuantity) > 0,
    );
  }

  async updateBatchRemaining(id: number, remainingQuantity: string) {
    const batch = this.batches.find((candidate) => candidate.id === id);
    if (batch) batch.remainingQuantity = remainingQuantity;
  }

  async listStock() {
    return [];
  }
}

describe("FIFO inventory service", () => {
  it("receives stock as one batch and one positive movement", async () => {
    const repo = new FakeInventoryRepository();
    const service = new InventoryService(repo);

    const result = await service.receive({
      itemId: 1,
      warehouse: "main",
      quantity: 3.5,
      unitCost: "4.25",
      movementType: "purchase",
      referenceType: "purchase_invoice",
      referenceId: 7,
    });

    expect(result).toEqual({ batchId: 1, deficitAllocations: [] });
    expect(repo.batches[0]).toMatchObject({
      initialQuantity: "3.500",
      remainingQuantity: "3.500",
      unitCost: "4.250000",
    });
    expect(repo.movements[0]).toMatchObject({
      batchId: 1,
      quantity: "3.500",
      unitCost: "4.250000",
    });
  });

  it("accepts a zero unit cost for correction stock", async () => {
    const repo = new FakeInventoryRepository();
    const service = new InventoryService(repo);

    await expect(
      service.receive({
        itemId: 1,
        warehouse: "main",
        quantity: 1,
        unitCost: "0",
        movementType: "stocktake_surplus",
      }),
    ).resolves.toEqual({ batchId: 1, deficitAllocations: [] });
    expect(repo.batches[0].unitCost).toBe("0.000000");
  });

  it("uses incoming stock to reconcile an earlier negative balance", async () => {
    const repo = new FakeInventoryRepository();
    repo.movements.push({
      itemId: 1,
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
      itemId: 1,
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
        deficitMovementId: 1,
        batchId: 1,
        quantity: "1.000",
        unitCost: "8.000000",
      },
    ]);
  });

  it("preserves exact maximum costs and rejects database overflow", async () => {
    const repo = new FakeInventoryRepository();
    const service = new InventoryService(repo);

    await service.receive({
      itemId: 1,
      warehouse: "main",
      quantity: 1,
      unitCost: "9999999999.999999",
      movementType: "purchase",
    });
    expect(repo.batches[0].unitCost).toBe("9999999999.999999");

    await expect(
      service.receive({
        itemId: 1,
        warehouse: "main",
        quantity: 1,
        unitCost: "10000000000.000000",
        movementType: "purchase",
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("consumes the oldest batches first and returns the FIFO cost", async () => {
    const repo = new FakeInventoryRepository();
    repo.batches = [
      {
        id: 1,
        itemId: 1,
        warehouse: "main",
        initialQuantity: "2.000",
        remainingQuantity: "2.000",
        unitCost: "10.000000",
        receivedAt: new Date("2026-07-01T00:00:00Z"),
        sourceType: "purchase",
        sourceId: 1,
      },
      {
        id: 2,
        itemId: 1,
        warehouse: "main",
        initialQuantity: "5.000",
        remainingQuantity: "5.000",
        unitCost: "12.000000",
        receivedAt: new Date("2026-07-02T00:00:00Z"),
        sourceType: "purchase",
        sourceId: 2,
      },
    ];
    const service = new InventoryService(repo);

    const result = await service.consume({
      itemId: 1,
      warehouse: "main",
      quantity: 4,
      movementType: "transfer_out",
      referenceType: "transfer",
      referenceId: 9,
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
          batchId: 1,
          movementId: 1,
          quantity: "2.000",
          unitCost: "10.000000",
        },
        {
          batchId: 2,
          movementId: 2,
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
        id: 1,
        itemId: 1,
        warehouse: "main",
        initialQuantity: "2.000",
        remainingQuantity: "2.000",
        unitCost: "10.000000",
        receivedAt: new Date("2026-07-01T00:00:00Z"),
        sourceType: "purchase",
        sourceId: 1,
      },
    ];
    const service = new InventoryService(repo);

    await expect(
      service.consume({
        itemId: 1,
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
        id: 1,
        itemId: 1,
        warehouse: "cafe",
        initialQuantity: "1.000",
        remainingQuantity: "1.000",
        unitCost: "8.000000",
        receivedAt: new Date("2026-07-01T00:00:00Z"),
        sourceType: "transfer_in",
        sourceId: 1,
      },
    ];
    const service = new InventoryService(repo);

    const result = await service.consume({
      itemId: 1,
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
          batchId: 1,
          movementId: 1,
          quantity: "1.000",
          unitCost: "8.000000",
        },
        {
          batchId: null,
          movementId: 2,
          quantity: "1.000",
          unitCost: "0.000000",
        },
      ],
    });
  });

  it("rolls back several session operations with their outer transaction", async () => {
    const repo = new FakeInventoryRepository();
    const service = new InventoryService(repo);

    await expect(
      service.transaction(async (inventory) => {
        await inventory.receive({
          itemId: 1,
          warehouse: "main",
          quantity: 2,
          unitCost: "5",
          movementType: "purchase",
        });
        await inventory.consume({
          itemId: 1,
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

describe("inventory input validation", () => {
  const baseReceive = {
    itemId: 1,
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
        itemId: 1,
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
    missing.items.delete(1);
    await expect(
      new InventoryService(missing).receive({
        itemId: 1,
        warehouse: "main",
        quantity: 1,
        unitCost: "5",
        movementType: "purchase",
      }),
    ).rejects.toMatchObject({ status: 404 });

    const inactive = new FakeInventoryRepository();
    inactive.items.set(1, { id: 1, isActive: false });
    await expect(
      new InventoryService(inactive).consume({
        itemId: 1,
        warehouse: "main",
        quantity: 1,
        movementType: "sale",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("inventory deficit and stock flags", () => {
  const deficitMovement = (quantity: string) => ({
    itemId: 1,
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
      itemId: 1,
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
      { deficitMovementId: 1, batchId: 1, quantity: "1.000", unitCost: "8.000000" },
      { deficitMovementId: 2, batchId: 1, quantity: "1.000", unitCost: "8.000000" },
    ]);
  });

  it("flags low and negative stock levels", async () => {
    const repo = new FakeInventoryRepository();
    const row = (overrides: Record<string, unknown>) => ({
      itemId: 1,
      code: 1001,
      name: "بن",
      categoryId: 1,
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
