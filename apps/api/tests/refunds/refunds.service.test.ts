import { describe, expect, it, vi } from "vitest";
import type { RefundsRepository } from "../../src/modules/refunds/refunds.repository.js";
import { RefundsService } from "../../src/modules/refunds/refunds.service.js";

const cashierId = 9;

const recipeLine = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  quantity: "2.000",
  type: "recipe",
  productName: "كابتشينو",
  sizeName: "وسط",
  unitPrice: "30.00",
  lineSubtotal: "60.00",
  ...overrides,
});

function txForCreate(overrides: Record<string, unknown> = {}) {
  return {
    findByClientRequestId: vi.fn(async () => undefined),
    findOpenShiftForCashier: vi.fn(async () => ({ id: 3 })),
    lockOrder: vi.fn(async () => ({
      id: 10,
      subtotal: "100.00",
      total: "90.00",
    })),
    lockOrderLines: vi.fn(async () => [recipeLine()]),
    refundedQuantities: vi.fn(async () => []),
    financialTotals: vi.fn(async () => ({ gross: "0.00", refunded: "0.00" })),
    createRefund: vi.fn(async () => 55),
    createLine: vi.fn(async () => 100),
    updateTotalCost: vi.fn(async () => undefined),
    allocations: vi.fn(async () => []),
    returnedAllocationQuantities: vi.fn(async () => []),
    ...overrides,
  };
}

function repoForCreate(tx: Record<string, unknown>) {
  return {
    transaction: vi.fn(async (run) =>
      run(tx, { receive: vi.fn(async () => ({ batchId: 1 })) }),
    ),
    findByClientRequestId: vi.fn(async () => undefined),
    find: vi.fn(async () => ({ id: 55 })),
    listLines: vi.fn(async () => []),
  } as unknown as RefundsRepository;
}

const refundInput = {
  clientRequestId: "8f345091-c497-4b8b-b4f3-a8ebdc47dd31",
  orderId: 10,
  reason: "طلب العميل",
  lines: [{ orderLineId: 1, quantity: 2, stockAction: null }],
};

describe("RefundsService.create discount-share math", () => {
  it("splits a discounted total across lines in line-id order", async () => {
    const tx = txForCreate({
      lockOrderLines: vi.fn(async () => [
        recipeLine(),
        recipeLine({
          id: 2,
          quantity: "1.000",
          productName: "شاي",
          sizeName: "صغير",
          unitPrice: "40.00",
          lineSubtotal: "40.00",
        }),
      ]),
    });
    const repo = repoForCreate(tx);

    const refund = await new RefundsService(repo).create(
      {
        ...refundInput,
        lines: [
          { orderLineId: 2, quantity: 1, stockAction: null },
          { orderLineId: 1, quantity: 2, stockAction: null },
        ],
      },
      cashierId,
    );

    expect(refund).toEqual({ id: 55, lines: [] });
    expect(tx.createRefund).toHaveBeenCalledWith(
      expect.objectContaining({ amount: "90.00" }),
    );
    const lineCalls = tx.createLine.mock.calls.map((call) => call[0]);
    expect(lineCalls).toEqual([
      expect.objectContaining({
        grossAmount: "60.00",
        refundAmount: "54.00",
      }),
      expect.objectContaining({
        grossAmount: "40.00",
        refundAmount: "36.00",
      }),
    ]);
    expect(tx.updateTotalCost).toHaveBeenCalledWith(55, "0.00");
  });

  it("409s when the refund exceeds the remaining cash balance", async () => {
    const tx = txForCreate({
      financialTotals: vi.fn(async () => ({
        gross: "0.00",
        refunded: "80.00",
      })),
    });
    const repo = repoForCreate(tx);

    await expect(
      new RefundsService(repo).create(refundInput, cashierId),
    ).rejects.toMatchObject({ status: 409 });
    expect(tx.createRefund).not.toHaveBeenCalled();
  });

  it("409s a zero-value refund", async () => {
    const tx = txForCreate({
      lockOrder: vi.fn(async () => ({
        id: 10,
        subtotal: "0.00",
        total: "0.00",
      })),
      lockOrderLines: vi.fn(async () => [
        recipeLine({ lineSubtotal: "0.00" }),
      ]),
    });
    const repo = repoForCreate(tx);

    await expect(
      new RefundsService(repo).create(refundInput, cashierId),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("RefundsService.create guards", () => {
  it("409s without an open shift and 404s a missing order", async () => {
    const noShift = repoForCreate(
      txForCreate({
        findOpenShiftForCashier: vi.fn(async () => undefined),
      }),
    );
    await expect(
      new RefundsService(noShift).create(refundInput, cashierId),
    ).rejects.toMatchObject({ status: 409 });

    const noOrder = repoForCreate(
      txForCreate({ lockOrder: vi.fn(async () => undefined) }),
    );
    await expect(
      new RefundsService(noOrder).create(refundInput, cashierId),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("400s a line that does not belong to the order", async () => {
    const tx = txForCreate({ lockOrderLines: vi.fn(async () => []) });
    const repo = repoForCreate(tx);

    await expect(
      new RefundsService(repo).create(refundInput, cashierId),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("409s a return beyond the sold quantity", async () => {
    const tx = txForCreate({
      refundedQuantities: vi.fn(async () => [
        { orderLineId: 1, quantity: "1.500", grossAmount: "45.00" },
      ]),
    });
    const repo = repoForCreate(tx);

    await expect(
      new RefundsService(repo).create(refundInput, cashierId),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("400s fractional recipe quantities and wrong stock actions", async () => {
    const fractional = repoForCreate(txForCreate());
    await expect(
      new RefundsService(fractional).create(
        {
          ...refundInput,
          lines: [{ orderLineId: 1, quantity: 1.5, stockAction: null }],
        },
        cashierId,
      ),
    ).rejects.toMatchObject({ status: 400 });

    const itemTx = txForCreate({
      lockOrderLines: vi.fn(async () => [
        recipeLine({ type: "item", productName: "لبن" }),
      ]),
    });
    await expect(
      new RefundsService(repoForCreate(itemTx)).create(
        refundInput,
        cashierId,
      ),
    ).rejects.toMatchObject({ status: 400 });

    const recipeWithAction = repoForCreate(txForCreate());
    await expect(
      new RefundsService(recipeWithAction).create(
        {
          ...refundInput,
          lines: [
            { orderLineId: 1, quantity: 2, stockAction: "return_to_stock" },
          ],
        },
        cashierId,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("RefundsService lookups", () => {
  it("404s missing refunds and orders, and delegates list", async () => {
    const repo = {
      find: vi.fn(async () => undefined),
      findOrder: vi.fn(async () => undefined),
      list: vi.fn(async () => [{ id: 1 }]),
    } as unknown as RefundsRepository;
    const service = new RefundsService(repo);

    await expect(service.get(999)).rejects.toMatchObject({ status: 404 });
    await expect(service.quantities(999)).rejects.toMatchObject({
      status: 404,
    });
    await expect(service.list()).resolves.toEqual([{ id: 1 }]);
  });
});
