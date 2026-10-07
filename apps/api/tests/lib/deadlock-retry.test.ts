import { testId } from "@cashier/shared/test-support";
import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@cashier/shared";
import type { CategoriesRepository } from "../../src/modules/categories/categories.repository.js";
import { CategoriesService } from "../../src/modules/categories/categories.service.js";
import type { OrdersRepository } from "../../src/modules/orders/orders.repository.js";
import { OrdersService } from "../../src/modules/orders/orders.service.js";
import type { PurchasesRepository } from "../../src/modules/purchases/purchases.repository.js";
import { PurchasesService } from "../../src/modules/purchases/purchases.service.js";
import type { RefundsRepository } from "../../src/modules/refunds/refunds.repository.js";
import { RefundsService } from "../../src/modules/refunds/refunds.service.js";
import type { TransfersRepository } from "../../src/modules/transfers/transfers.repository.js";
import { TransfersService } from "../../src/modules/transfers/transfers.service.js";
import type { WasteRepository } from "../../src/modules/waste/waste.repository.js";
import { WasteService } from "../../src/modules/waste/waste.service.js";
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
        .mockResolvedValue({ id: testId(1), parentId: null, isActive: true }),
      hasActiveItems: vi.fn().mockResolvedValue(false),
      hasActiveRecipes: vi.fn().mockResolvedValue(false),
      create: vi.fn().mockResolvedValue(testId(9)),
    } as unknown as CategoriesRepository & { transaction: ReturnType<typeof vi.fn> };

    const id = await new CategoriesService(repo).create({
      name: "New",
      parentId: testId(1),
      isActive: true,
    } as never);

    expect(id).toBe(testId(9));
    expect(repo.transaction).toHaveBeenCalledTimes(2);
  });
});

describe("orders.create retries after a deadlock", () => {
  it("retries the whole sale transaction once", async () => {
    let stored: { id: string; cashierId: string; requestFingerprint: string } | undefined;
    const tx = {
      findByClientRequestId: vi.fn(async () => stored),
      findOpenShiftForCashier: vi.fn().mockResolvedValue({ id: testId(1) }),
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
          ingredients: [{ itemId: testId(1), itemName: "حليب", quantity: "0.010" }],
          sizes: [],
          modifierGroups: [],
        },
      ]),
      lockStockItems: vi.fn().mockResolvedValue([{ id: testId(1), isActive: true }]),
      createOrder: vi.fn(
        async (row: { requestFingerprint: string; cashierId: string }) => {
          stored = {
            id: testId(5),
            cashierId: row.cashierId,
            requestFingerprint: row.requestFingerprint,
          };
          return 5;
        },
      ),
      createLine: vi.fn().mockResolvedValue(testId(10)),
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
                  { quantity: "0.010", unitCost: "1.000000", batchId: testId(1), movementId: testId(1) },
                ],
              }),
            }),
        ),
      findByClientRequestId: vi.fn(async () => stored),
      findOrder: vi.fn().mockResolvedValue({ id: testId(5) }),
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

    expect(replay.id).toBe(testId(5));
    expect(repo.transaction).toHaveBeenCalledTimes(2);
  });
});

describe("purchases.create retries after a deadlock", () => {
  it("retries the invoice transaction once", async () => {
    const transactionRepo = {
      findByClientRequestId: vi.fn().mockResolvedValue(undefined),
      findSupplierForUpdate: vi.fn().mockResolvedValue({ id: testId(1), isActive: true }),
      hasInvoiceNumber: vi.fn().mockResolvedValue(false),
      lockItems: vi.fn().mockResolvedValue([
        {
          id: testId(5),
          type: "raw",
          isActive: true,
          stockUnit: "كجم",
          purchaseUnit: null,
          purchaseToStockFactor: null,
        },
      ]),
      createInvoice: vi.fn().mockResolvedValue(testId(44)),
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
        supplierId: testId(1),
        invoiceNumber: "INV-1",
        purchasedAt: "2026-07-20",
        paidAmount: 0,
        notes: null,
        lines: [{ itemId: testId(5), quantity: 1, unitMode: "stock", unitPrice: 10 }],
      } as never,
      testId(7),
    );

    expect(id).toBe(testId(44));
    expect(repo.transaction).toHaveBeenCalledTimes(2);
  });
});

describe("refunds.create retries after a deadlock", () => {
  it("retries the refund transaction once", async () => {
    let stored:
      | { id: string; cashierId: string; requestFingerprint: string }
      | undefined;
    const order = { id: testId(1), subtotal: "16.00", total: "12.00" };
    const tx = {
      findByClientRequestId: vi.fn(async () => stored),
      findOpenShiftForCashier: vi.fn().mockResolvedValue({ id: testId(1) }),
      lockOrder: vi.fn().mockResolvedValue(order),
      lockOrderLines: vi
        .fn()
        .mockResolvedValue([
          {
            id: testId(10),
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
        async (row: { requestFingerprint: string; cashierId: string }) => {
          stored = {
            id: testId(7),
            cashierId: row.cashierId,
            requestFingerprint: row.requestFingerprint,
          };
          return 7;
        },
      ),
      allocations: vi.fn().mockResolvedValue([
        { id: testId(1), itemId: testId(1), quantity: "0.020", unitCost: "1.000000" },
      ]),
      returnedAllocationQuantities: vi.fn().mockResolvedValue([]),
      createLine: vi.fn().mockResolvedValue(testId(20)),
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
            run(tx, { receive: vi.fn().mockResolvedValue({ batchId: testId(3) }) }),
        ),
      findByClientRequestId: vi.fn(async () => stored),
      find: vi.fn().mockResolvedValue({ id: testId(7) }),
      listLines: vi.fn().mockResolvedValue([]),
    } as unknown as RefundsRepository & { transaction: ReturnType<typeof vi.fn> };

    const refund = await new RefundsService(repo).create(
      {
        clientRequestId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        orderId: testId(1),
        reason: "تلف",
        lines: [
          {
            orderLineId: testId(10),
            quantity: 1,
            stockAction: "return_to_stock",
          },
        ],
      } as never,
      7,
    );

    expect(refund.id).toBe(testId(7));
    expect(repo.transaction).toHaveBeenCalledTimes(2);
  });
});

describe("transfers.createRequest retries after a deadlock", () => {
  it("retries the request transaction once", async () => {
    const tx = {
      findRequestByClientRequestId: vi.fn().mockResolvedValue(undefined),
      findOpenShiftForCashier: vi.fn().mockResolvedValue({ id: testId(1) }),
      lockItems: vi
        .fn()
        .mockResolvedValue([{ id: testId(5), name: "حليب", isActive: true }]),
      createRequest: vi.fn().mockResolvedValue(testId(31)),
      createRequestLine: vi.fn().mockResolvedValue(undefined),
    };
    const repo = {
      transaction: vi
        .fn()
        .mockRejectedValueOnce(deadlock)
        .mockImplementationOnce(
          async (run: (r: typeof tx, inv: object) => Promise<number>) =>
            run(tx, {}),
        ),
    } as unknown as TransfersRepository & {
      transaction: ReturnType<typeof vi.fn>;
    };

    const id = await new TransfersService(repo).createRequest(
      {
        clientRequestId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        notes: null,
        lines: [{ itemId: testId(5), quantity: 2 }],
      } as never,
      { id: testId(7), name: "كاشير", role: "cashier" } as AuthUser,
    );

    expect(id).toBe(testId(31));
    expect(repo.transaction).toHaveBeenCalledTimes(2);
  });
});

describe("waste.create retries after a deadlock", () => {
  it("retries the create transaction once", async () => {
    const tx = {
      findByClientRequestId: vi.fn().mockResolvedValue(undefined),
      findOpenShiftForCashier: vi.fn().mockResolvedValue({ id: testId(1) }),
      findItem: vi.fn().mockResolvedValue({
        id: testId(1),
        name: "بن",
        stockUnit: "كجم",
        isActive: true,
      }),
      create: vi.fn().mockResolvedValue(testId(12)),
      updateCost: vi.fn(),
    };
    const repo = {
      transaction: vi
        .fn()
        .mockRejectedValueOnce(deadlock)
        .mockImplementationOnce(
          async (run: (r: typeof tx, inv: object) => Promise<number>) =>
            run(tx, {
              consume: vi.fn().mockResolvedValue({ allocations: [] }),
            }),
        ),
      findByClientRequestId: vi.fn().mockResolvedValue(undefined),
      find: vi.fn().mockResolvedValue({ id: testId(12) }),
      allocations: vi.fn().mockResolvedValue([]),
    } as unknown as WasteRepository & { transaction: ReturnType<typeof vi.fn> };

    const entry = await new WasteService(repo).create(
      {
        clientRequestId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        warehouse: "cafe",
        target: { type: "item", itemId: testId(1) },
        quantity: 1,
        reason: "spill",
        note: null,
      } as never,
      { id: testId(7), name: "كاشير", role: "cashier" } as AuthUser,
    );

    expect(entry.id).toBe(testId(12));
    expect(repo.transaction).toHaveBeenCalledTimes(2);
  });
});
