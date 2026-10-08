import { testId } from "@cashier/shared/test-support";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@cashier/web-core/lib/api";
import {
  createOrder,
  getOrder,
  listCatalog,
  listExternalOrders,
  listOrders,
} from "../../src/services/orders-service";

vi.mock("@cashier/web-core/lib/api", () => ({ api: vi.fn() }));
const mockedApi = vi.mocked(api);

describe("orders service", () => {
  beforeEach(() => mockedApi.mockReset());

  it("loads the local resale catalog together with the imported catalog for POS", async () => {
    mockedApi.mockResolvedValue({
      products: [],
      categories: [],
      pagination: { currentPage: 1, totalPages: 1 },
      localCategories: [{ id: testId(1), name: "مشروبات", parentId: null }],
      localProducts: [
        {
          id: testId(9),
          name: "تركي سنجل",
          categoryId: testId(1),
          sellingPrice: "35.00",
          stockUnit: "فنجان",
        },
      ],
    } as never);
    const catalog = await listCatalog();
    expect(mockedApi).toHaveBeenCalledWith("/api/products?all=true&pos=true");
    expect(catalog).toMatchObject({
      localProducts: [{ sellingPrice: "35.00" }],
    });
  });

  it("uses catalog, recent-order, detail, and creation endpoints", async () => {
    mockedApi.mockResolvedValue({
      products: [],
      pagination: { totalPages: 1 },
    } as never);
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
    await getOrder(testId(7));
    await createOrder(body);

    expect(mockedApi.mock.calls).toEqual([
      ["/api/products?all=true&pos=true"],
      ["/api/orders"],
      ["/api/orders/external"],
      ["/api/orders/00000000-0000-7000-8000-000000000007"],
      ["/api/orders", { method: "POST", body: JSON.stringify(body) }],
    ]);
  });
});
