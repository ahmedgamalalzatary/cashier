import { testId } from "@cashier/shared/test-support";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@cashier/web-core/lib/api";
import {
  createPurchase,
  getPurchase,
  listPurchases,
  type PurchaseCreateBody,
} from "../../src/services/purchases-service";

vi.mock("@cashier/web-core/lib/api", () => ({ api: vi.fn() }));

describe("purchases service", () => {
  const request = vi.mocked(api);

  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue(undefined as never);
  });

  it("lists and loads purchase invoices", async () => {
    await listPurchases();
    await getPurchase(testId(9));

    expect(request).toHaveBeenNthCalledWith(1, "/api/purchases");
    expect(request).toHaveBeenNthCalledWith(2, "/api/purchases/00000000-0000-7000-8000-000000000009");
  });

  it("creates a confirmed purchase invoice", async () => {
    const body: PurchaseCreateBody = {
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      supplierId: testId(2),
      invoiceNumber: "A-1",
      purchasedAt: "2026-07-19",
      paidAmount: 20,
      notes: null,
      lines: [
        {
          itemId: testId(3),
          quantity: 2,
          unitMode: "purchase",
          unitPrice: 50,
          toCafeQuantity: 0,
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
