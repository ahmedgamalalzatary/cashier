import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../src/lib/api";
import {
  createOrder,
  getOrder,
  listCatalog,
  listExternalOrders,
  listOrders,
} from "../../src/services/orders-service";

vi.mock("../../src/lib/api", () => ({ api: vi.fn() }));
const mockedApi = vi.mocked(api);

describe("orders service", () => {
  beforeEach(() => mockedApi.mockReset());

  it("uses catalog, recent-order, detail, and creation endpoints", async () => {
    mockedApi.mockResolvedValue(undefined as never);
    const body = {
      clientRequestId: "90f2d7c2-2f4f-4de6-9abf-42eaba11e2cf",
      lines: [
        {
          type: "external_product" as const,
          externalProductId: 4,
          externalSizeId: 40,
          quantity: 2,
          modifiers: [{ externalModifierOptionId: 7, quantity: 1 }],
        },
      ],
      discount: { type: "percent" as const, value: 10 },
      cashReceived: 100,
    };

    await listCatalog();
    await listOrders();
    await listExternalOrders();
    await getOrder(7);
    await createOrder(body);

    expect(mockedApi.mock.calls).toEqual([
      ["/api/products"],
      ["/api/orders"],
      ["/api/orders/external"],
      ["/api/orders/7"],
      ["/api/orders", { method: "POST", body: JSON.stringify(body) }],
    ]);
  });
});
