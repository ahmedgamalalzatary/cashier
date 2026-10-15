import { testId } from "@cashier/shared/test-support";
import { describe, expect, it, vi } from "vitest";
import type { InventoryTransaction } from "../../src/modules/inventory/inventory.service.js";
import { moveStockToCafe } from "../../src/modules/transfers/move-stock.js";
import type { TransfersRepository } from "../../src/modules/transfers/transfers.repository.js";

const header = {
  requestId: null,
  purchaseInvoiceId: null,
  createdBy: testId(7),
  approvedBy: testId(7),
  notes: null,
};

function fakeRepo() {
  const createTransferLine = vi.fn(async () => undefined);
  const repo = {
    createTransfer: vi.fn(async () => testId(41)),
    createTransferLine,
  } as unknown as TransfersRepository;
  return { repo, createTransferLine };
}

describe("moveStockToCafe negative stock", () => {
  it("takes main below zero and costs the shortfall at the last known cost", async () => {
    const { repo, createTransferLine } = fakeRepo();
    const receive = vi
      .fn()
      .mockResolvedValueOnce({ batchId: testId(31) })
      .mockResolvedValueOnce({ batchId: testId(32) });
    const consume = vi.fn().mockResolvedValue({
      quantity: "3.000",
      totalCost: "30.000000",
      allocations: [
        {
          batchId: testId(11),
          movementId: testId(21),
          quantity: "2.000",
          unitCost: "10.000000",
        },
        {
          batchId: null,
          movementId: testId(22),
          quantity: "1.000",
          unitCost: "10.000000",
        },
      ],
    });
    const inventory = {
      lastKnownUnitCosts: vi
        .fn()
        .mockResolvedValue(new Map([[testId(5), "10.000000"]])),
      consume,
      receive,
    } as unknown as InventoryTransaction;

    const transferId = await moveStockToCafe(
      repo,
      inventory,
      header,
      [{ itemId: testId(5), quantity: 3 }],
    );

    expect(transferId).toBe(testId(41));
    expect(consume).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: testId(5),
        warehouse: "main",
        quantity: 3,
        allowNegative: true,
        shortfallUnitCost: "10.000000",
      }),
    );
    expect(receive).toHaveBeenCalledTimes(2);
    expect(receive.mock.calls[1][0]).toMatchObject({
      warehouse: "cafe",
      quantity: 1,
      unitCost: "10.000000",
    });
    expect(createTransferLine.mock.calls).toEqual([
      [
        {
          transferId: testId(41),
          itemId: testId(5),
          quantity: "2.000",
          unitCost: "10.000000",
          sourceBatchId: testId(11),
          cafeBatchId: testId(31),
        },
      ],
      [
        {
          transferId: testId(41),
          itemId: testId(5),
          quantity: "1.000",
          unitCost: "10.000000",
          sourceBatchId: null,
          cafeBatchId: testId(32),
        },
      ],
    ]);
  });

  it("costs a never-received item's shortfall at zero", async () => {
    const { repo, createTransferLine } = fakeRepo();
    const consume = vi.fn().mockResolvedValue({
      quantity: "2.000",
      totalCost: "0.000000",
      allocations: [
        {
          batchId: null,
          movementId: testId(21),
          quantity: "2.000",
          unitCost: "0.000000",
        },
      ],
    });
    const inventory = {
      lastKnownUnitCosts: vi.fn().mockResolvedValue(new Map()),
      consume,
      receive: vi.fn().mockResolvedValue({ batchId: testId(31) }),
    } as unknown as InventoryTransaction;

    await moveStockToCafe(repo, inventory, header, [
      { itemId: testId(5), quantity: 2 },
    ]);

    expect(consume).toHaveBeenCalledWith(
      expect.objectContaining({ shortfallUnitCost: "0.000000" }),
    );
    expect(createTransferLine).toHaveBeenCalledWith(
      expect.objectContaining({
        quantity: "2.000",
        unitCost: "0.000000",
        sourceBatchId: null,
      }),
    );
  });
});
