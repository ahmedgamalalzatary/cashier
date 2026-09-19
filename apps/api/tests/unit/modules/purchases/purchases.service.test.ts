import { describe, expect, it, vi } from "vitest";
import { HttpError } from "../../../../src/middleware/error.js";
import type { PurchasesRepository } from "../../../../src/modules/purchases/purchases.repository.js";
import { PurchasesService } from "../../../../src/modules/purchases/purchases.service.js";

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
