import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../src/lib/api";
import {
  createOrder,
  getOrder,
  listCatalog,
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
      lines: [{ type: "recipe" as const, recipeSizeId: 4, quantity: 2 }],
      discount: { type: "percent" as const, value: 10 },
      cashReceived: 100,
    };

    await listCatalog();
    await listOrders();
    await getOrder(7);
    await createOrder(body);

    expect(mockedApi.mock.calls).toEqual([
      ["/api/orders/catalog"],
      ["/api/orders"],
      ["/api/orders/7"],
      ["/api/orders", { method: "POST", body: JSON.stringify(body) }],
    ]);
  });
});
