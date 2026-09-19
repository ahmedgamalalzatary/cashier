import { describe, expect, it, vi } from "vitest";
import { HttpError } from "../../src/middleware/error.js";
import type { PurchasesRepository } from "../../src/modules/purchases/purchases.repository.js";
import { PurchasesService } from "../../src/modules/purchases/purchases.service.js";

const purchaseInput = {
  clientRequestId: "11111111-1111-4111-8111-111111111111",
  supplierId: 1,
  invoiceNumber: "DUP-1",
  purchasedAt: "2026-07-20",
  paidAmount: 0,
  notes: null,
  lines: [{ itemId: 5, quantity: 1, unitMode: "stock", unitPrice: 10 }],
} as const;

function repoWithInvoiceRace(overrides: Record<string, unknown>) {
  const transactionRepo = {
    findByClientRequestId: vi.fn().mockResolvedValue(undefined),
    findSupplierForUpdate: vi
      .fn()
      .mockResolvedValue({ id: 1, isActive: true }),
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
    ...overrides,
  };
  const repo = {
    transaction: vi.fn(async (run) =>
      run(transactionRepo, { receive: vi.fn() }),
    ),
    findByClientRequestId: vi.fn().mockResolvedValue(undefined),
  } as unknown as PurchasesRepository;
  return { repo, transactionRepo };
}

describe("PurchasesService duplicate invoice race", () => {
  it("maps a losing duplicate-invoice insert to a 409 instead of a 500", async () => {
    const duplicate = Object.assign(new Error("duplicate"), {
      code: "ER_DUP_ENTRY",
    });
    const { repo } = repoWithInvoiceRace({
      createInvoice: vi.fn().mockRejectedValue(duplicate),
    });

    const failure = await new PurchasesService(repo)
      .create(purchaseInput as never, 7)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(HttpError);
    expect((failure as HttpError).status).toBe(409);
    expect((failure as HttpError).message).toBe(
      "رقم الفاتورة مسجل لهذا المورد من قبل",
    );
  });
});

describe("PurchasesService stock receive order", () => {
  it("receives stock in itemId order even when invoice lines are reversed", async () => {
    const receive = vi.fn();
    const transactionRepo = {
      findByClientRequestId: vi.fn().mockResolvedValue(undefined),
      findSupplierForUpdate: vi
        .fn()
        .mockResolvedValue({ id: 1, isActive: true }),
      hasInvoiceNumber: vi.fn().mockResolvedValue(false),
      lockItems: vi.fn().mockResolvedValue([
        {
          id: 2,
          type: "raw",
          isActive: true,
          stockUnit: "كجم",
          purchaseUnit: null,
          purchaseToStockFactor: null,
        },
        {
          id: 9,
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
      transaction: vi.fn(async (run) => run(transactionRepo, { receive })),
      findByClientRequestId: vi.fn().mockResolvedValue(undefined),
    } as unknown as PurchasesRepository;

    await new PurchasesService(repo).create(
      {
        ...purchaseInput,
        lines: [
          { itemId: 9, quantity: 1, unitMode: "stock", unitPrice: 10 },
          { itemId: 2, quantity: 1, unitMode: "stock", unitPrice: 10 },
        ],
      } as never,
      7,
    );

    expect(receive.mock.calls.map((call) => call[0].itemId)).toEqual([2, 9]);
  });
});

const stockItem = (overrides: Record<string, unknown> = {}) => ({
  id: 5,
  type: "raw",
  isActive: true,
  stockUnit: "كجم",
  purchaseUnit: null,
  purchaseToStockFactor: null,
  ...overrides,
});

function repoForCreate(txRepo: Record<string, unknown>) {
  return {
    transaction: vi.fn(async (run) =>
      run(txRepo, { receive: vi.fn() }),
    ),
    findByClientRequestId: vi.fn(async () => undefined),
  } as unknown as PurchasesRepository;
}

function txForCreate(overrides: Record<string, unknown> = {}) {
  return {
    findByClientRequestId: vi.fn(async () => undefined),
    findSupplierForUpdate: vi.fn(async () => ({ id: 1, isActive: true })),
    hasInvoiceNumber: vi.fn(async () => false),
    lockItems: vi.fn(async () => [stockItem()]),
    createInvoice: vi.fn(async () => 44),
    createLine: vi.fn(async () => undefined),
    createPayment: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("PurchasesService supplier guards", () => {
  it("404s a missing supplier and 409s an inactive or duplicate invoice", async () => {
    const missing = repoForCreate(
      txForCreate({
        findSupplierForUpdate: vi.fn(async () => undefined),
      }),
    );
    await expect(
      new PurchasesService(missing).create(purchaseInput as never, 7),
    ).rejects.toMatchObject({ status: 404 });

    const inactive = repoForCreate(
      txForCreate({
        findSupplierForUpdate: vi.fn(async () => ({ id: 1, isActive: false })),
      }),
    );
    await expect(
      new PurchasesService(inactive).create(purchaseInput as never, 7),
    ).rejects.toMatchObject({ status: 409 });

    const duplicateInvoice = repoForCreate(
      txForCreate({ hasInvoiceNumber: vi.fn(async () => true) }),
    );
    await expect(
      new PurchasesService(duplicateInvoice).create(purchaseInput as never, 7),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("PurchasesService item guards", () => {
  it("404s a missing item and 409s inactive, prepared, or purchase-unit-less items", async () => {
    const cases: Array<{ lock: unknown[]; status: number }> = [
      { lock: [], status: 404 },
      { lock: [stockItem({ isActive: false })], status: 409 },
      { lock: [stockItem({ type: "prepared" })], status: 409 },
    ];
    for (const { lock, status } of cases) {
      const repo = repoForCreate(txForCreate({ lockItems: vi.fn(async () => lock) }));
      await expect(
        new PurchasesService(repo).create(purchaseInput as never, 7),
      ).rejects.toMatchObject({ status });
    }

    const noPurchaseUnit = repoForCreate(
      txForCreate({ lockItems: vi.fn(async () => [stockItem()]) }),
    );
    await expect(
      new PurchasesService(noPurchaseUnit).create(
        {
          ...purchaseInput,
          lines: [{ itemId: 5, quantity: 1, unitMode: "purchase", unitPrice: 10 }],
        } as never,
        7,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("PurchasesService cost guards", () => {
  it("400s fractional purchase-unit conversions and unit-cost overflow", async () => {
    const fractional = repoForCreate(
      txForCreate({
        lockItems: vi.fn(async () => [
          stockItem({
            purchaseUnit: "شكارة",
            purchaseToStockFactor: "0.0000015",
          }),
        ]),
      }),
    );
    await expect(
      new PurchasesService(fractional).create(
        {
          ...purchaseInput,
          lines: [{ itemId: 5, quantity: 1, unitMode: "purchase", unitPrice: 10 }],
        } as never,
        7,
      ),
    ).rejects.toMatchObject({ status: 400 });

    const overflow = repoForCreate(txForCreate());
    await expect(
      new PurchasesService(overflow).create(
        {
          ...purchaseInput,
          lines: [
            { itemId: 5, quantity: 0.001, unitMode: "stock", unitPrice: 9999999999.99 },
          ],
        } as never,
        7,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("400s an overpaid invoice", async () => {
    const repo = repoForCreate(txForCreate());

    await expect(
      new PurchasesService(repo).create(
        { ...purchaseInput, paidAmount: 1000 } as never,
        7,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("PurchasesService replay and lookup", () => {
  it("409s when the same key was created by another user", async () => {
    const repo = repoForCreate(
      txForCreate({
        findByClientRequestId: vi.fn(async () => ({
          id: 44,
          createdBy: 555,
          requestFingerprint: "other",
        })),
      }),
    );

    await expect(
      new PurchasesService(repo).create(purchaseInput as never, 7),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("404s a missing invoice on get", async () => {
    const repo = {
      findById: vi.fn(async () => undefined),
    } as unknown as PurchasesRepository;

    await expect(new PurchasesService(repo).get(999)).rejects.toMatchObject({
      status: 404,
    });
  });
});
