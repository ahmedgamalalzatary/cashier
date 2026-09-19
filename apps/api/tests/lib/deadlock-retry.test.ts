import { describe, expect, it, vi } from "vitest";
import type { CategoriesRepository } from "../../src/modules/categories/categories.repository.js";
import { CategoriesService } from "../../src/modules/categories/categories.service.js";
import type { OrdersRepository } from "../../src/modules/orders/orders.repository.js";
import { OrdersService } from "../../src/modules/orders/orders.service.js";
import type { PurchasesRepository } from "../../src/modules/purchases/purchases.repository.js";
import { PurchasesService } from "../../src/modules/purchases/purchases.service.js";
import type { RefundsRepository } from "../../src/modules/refunds/refunds.repository.js";
import { RefundsService } from "../../src/modules/refunds/refunds.service.js";
import { transactionWithDeadlockRetry } from "../../src/lib/deadlock-retry.js";

const deadlock = Object.assign(new Error("deadlock"), {
  code: "ER_LOCK_DEADLOCK",
});
const connectionLost = Object.assign(new Error("connection lost"), {
  code: "PROTOCOL_CONNECTION_LOST",
});

describe("transactionWithDeadlockRetry (shared wrapper)", () => {
  it("retries once after a MySQL deadlock and surfaces the result", async () => {
    const transaction = vi
      .fn()
      .mockRejectedValueOnce(deadlock)
      .mockResolvedValueOnce("ok");

    await expect(
      transactionWithDeadlockRetry(transaction),
    ).resolves.toBe("ok");
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-deadlock failures", async () => {
    const transaction = vi.fn().mockRejectedValue(connectionLost);

    await expect(transactionWithDeadlockRetry(transaction)).rejects.toBe(
      connectionLost,
    );
    expect(transaction).toHaveBeenCalledOnce();
  });
});

describe("categories.create retries after a deadlock", () => {
  it("retries the create transaction once", async () => {
    const repo = {
      transaction: vi
        .fn()
        .mockRejectedValueOnce(deadlock)
        .mockImplementationOnce(
          async (run: (value: CategoriesRepository) => Promise<void>) =>
            run(repo as unknown as CategoriesRepository),
        ),
      findByIdForUpdate: vi
        .fn()
        .mockResolvedValue({ id: 1, parentId: null, isActive: true }),
      hasActiveItems: vi.fn().mockResolvedValue(false),
      hasActiveRecipes: vi.fn().mockResolvedValue(false),
      create: vi.fn().mockResolvedValue(9),
    } as unknown as CategoriesRepository & { transaction: ReturnType<typeof vi.fn> };

    const id = await new CategoriesService(repo).create({
      name: "New",
      parentId: 1,
      isActive: true,
    } as never);

    expect(id).toBe(9);
    expect(repo.transaction).toHaveBeenCalledTimes(2);
  });
});

describe("orders.create retries after a deadlock", () => {
  it("retries the whole sale transaction once", async () => {
    let stored: { id: number; cashierId: number; requestFingerprint: string } | undefined;
    const tx = {
      findByClientRequestId: vi.fn(async () => stored),
      findOpenShiftForCashier: vi.fn().mockResolvedValue({ id: 1 }),
      loadExternalProducts: vi.fn().mockResolvedValue([
        {
          externalId: 1,
          nameAr: "P1",
          price: "10.00",
          discountPercentage: null,
          discountStart: null,
          discountEnd: null,
          isAvailable: true,
          isVisible: true,
          isCurrent: true,
          ingredients: [{ itemId: 1, itemName: "حليب", quantity: "0.010" }],
          sizes: [],
          modifierGroups: [],
        },
      ]),
      lockStockItems: vi.fn().mockResolvedValue([{ id: 1, isActive: true }]),
      createOrder: vi.fn(
        async (row: { requestFingerprint: string; cashierId: number }) => {
          stored = {
            id: 5,
            cashierId: row.cashierId,
            requestFingerprint: row.requestFingerprint,
          };
          return 5;
        },
      ),
      createLine: vi.fn().mockResolvedValue(10),
      createLineModifier: vi.fn(),
      createAllocation: vi.fn(),
      updateLine: vi.fn(),
      updateOrder: vi.fn(),
    };
    const repo = {
      transaction: vi
        .fn()
        .mockRejectedValueOnce(deadlock)
        .mockImplementationOnce(
          async (run: (r: typeof tx, inv: object) => Promise<number>) =>
            run(tx, {
              consume: vi.fn().mockResolvedValue({
                allocations: [
                  { quantity: "0.010", unitCost: "1.000000", batchId: 1, movementId: 1 },
                ],
              }),
            }),
        ),
      findByClientRequestId: vi.fn(async () => stored),
      findOrder: vi.fn().mockResolvedValue({ id: 5 }),
      listLines: vi.fn().mockResolvedValue([]),
      listAllocations: vi.fn().mockResolvedValue([]),
      listModifiers: vi.fn().mockResolvedValue([]),
    } as unknown as OrdersRepository & { transaction: ReturnType<typeof vi.fn> };

    const replay = await new OrdersService(repo).create(
      {
        clientRequestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        lines: [
          {
            type: "external_product" as const,
            externalProductId: 1,
            externalSizeId: null,
            quantity: 1,
            modifiers: [],
          },
        ],
        discount: null,
        cashReceived: 20,
      },
      7,
    );

    expect(replay.id).toBe(5);
    expect(repo.transaction).toHaveBeenCalledTimes(2);
  });
});

describe("purchases.create retries after a deadlock", () => {
  it("retries the invoice transaction once", async () => {
    const transactionRepo = {
      findByClientRequestId: vi.fn().mockResolvedValue(undefined),
      findSupplierForUpdate: vi.fn().mockResolvedValue({ id: 1, isActive: true }),
      hasInvoiceNumber: vi.fn().mockResolvedValue(false),
      lockItems: vi.fn().mockResolvedValue([
        {
          id: 5,
          type: "raw",
          isActive: true,
          stockUnit: "كجم",
          purchaseUnit: null,
          purchaseToStockFactor: null,
        },
      ]),
      createInvoice: vi.fn().mockResolvedValue(44),
      createLine: vi.fn(),
    };
    const repo = {
      transaction: vi
        .fn()
        .mockRejectedValueOnce(deadlock)
        .mockImplementationOnce(async (run: (r: typeof transactionRepo, inv: object) => Promise<number>) =>
          run(transactionRepo, { receive: vi.fn() }),
        ),
      findByClientRequestId: vi.fn().mockResolvedValue(undefined),
    } as unknown as PurchasesRepository & { transaction: ReturnType<typeof vi.fn> };

    const id = await new PurchasesService(repo).create(
      {
        clientRequestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        supplierId: 1,
        invoiceNumber: "INV-1",
        purchasedAt: "2026-07-20",
        paidAmount: 0,
        notes: null,
        lines: [{ itemId: 5, quantity: 1, unitMode: "stock", unitPrice: 10 }],
      } as never,
      7,
    );

    expect(id).toBe(44);
    expect(repo.transaction).toHaveBeenCalledTimes(2);
  });
});

describe("refunds.create retries after a deadlock", () => {
  it("retries the refund transaction once", async () => {
    let stored:
      | { id: number; cashierId: number; requestFingerprint: string }
      | undefined;
    const order = { id: 1, subtotal: "16.00", total: "12.00" };
    const tx = {
      findByClientRequestId: vi.fn(async () => stored),
      findOpenShiftForCashier: vi.fn().mockResolvedValue({ id: 1 }),
      lockOrder: vi.fn().mockResolvedValue(order),
      lockOrderLines: vi
        .fn()
        .mockResolvedValue([
          {
            id: 10,
            type: "external_product",
            itemId: null,
            externalProductId: 1,
            externalSizeId: null,
            productName: "P1",
            sizeName: null,
            quantity: "2.000",
            unitPrice: "8.00",
            lineSubtotal: "16.00",
          },
        ]),
      refundedQuantities: vi.fn().mockResolvedValue([]),
      financialTotals: vi.fn().mockResolvedValue({ gross: "0.00", refunded: "0.00" }),
      createRefund: vi.fn(
        async (row: { requestFingerprint: string; cashierId: number }) => {
          stored = {
            id: 7,
            cashierId: row.cashierId,
            requestFingerprint: row.requestFingerprint,
          };
          return 7;
        },
      ),
      allocations: vi.fn().mockResolvedValue([
        { id: 1, itemId: 1, quantity: "0.020", unitCost: "1.000000" },
      ]),
      returnedAllocationQuantities: vi.fn().mockResolvedValue([]),
      createLine: vi.fn().mockResolvedValue(20),
      createReturnAllocation: vi.fn(),
      createWaste: vi.fn(),
      updateTotalCost: vi.fn(),
    };
    const repo = {
      transaction: vi
        .fn()
        .mockRejectedValueOnce(deadlock)
        .mockImplementationOnce(
          async (run: (r: typeof tx, inv: object) => Promise<number>) =>
            run(tx, { receive: vi.fn().mockResolvedValue({ batchId: 3 }) }),
        ),
      findByClientRequestId: vi.fn(async () => stored),
      find: vi.fn().mockResolvedValue({ id: 7 }),
      listLines: vi.fn().mockResolvedValue([]),
    } as unknown as RefundsRepository & { transaction: ReturnType<typeof vi.fn> };

    const refund = await new RefundsService(repo).create(
      {
        clientRequestId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        orderId: 1,
        reason: "تلف",
        lines: [
          {
            orderLineId: 10,
            quantity: 1,
            stockAction: "return_to_stock",
          },
        ],
      } as never,
      7,
    );

    expect(refund.id).toBe(7);
    expect(repo.transaction).toHaveBeenCalledTimes(2);
  });
});
