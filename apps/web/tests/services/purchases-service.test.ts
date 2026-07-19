import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../src/lib/api";
import {
  createPurchase,
  getPurchase,
  listPurchases,
  type PurchaseCreateBody,
} from "../../src/services/purchases-service";

vi.mock("../../src/lib/api", () => ({ api: vi.fn() }));

describe("purchases service", () => {
  const request = vi.mocked(api);

  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue(undefined as never);
  });

  it("lists and loads purchase invoices", async () => {
    await listPurchases();
    await getPurchase(9);

    expect(request).toHaveBeenNthCalledWith(1, "/api/purchases");
    expect(request).toHaveBeenNthCalledWith(2, "/api/purchases/9");
  });

  it("creates a confirmed purchase invoice", async () => {
    const body: PurchaseCreateBody = {
      supplierId: 2,
      invoiceNumber: "A-1",
      purchasedAt: "2026-07-19",
      paidAmount: 20,
      notes: null,
      lines: [
        {
          itemId: 3,
          quantity: 2,
          unitMode: "purchase",
          unitPrice: 50,
        },
      ],
    };

    await createPurchase(body);

    expect(request).toHaveBeenCalledWith("/api/purchases", {
      method: "POST",
      body: JSON.stringify(body),
    });
  });
});
