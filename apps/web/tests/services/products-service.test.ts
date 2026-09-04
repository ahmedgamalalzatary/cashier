import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../src/lib/api";
import {
  configureProductStock,
  getProductRefreshStatus,
  listProducts,
  refreshProducts,
} from "../../src/services/products-service";

vi.mock("../../src/lib/api", () => ({ api: vi.fn() }));
const mockedApi = vi.mocked(api);

describe("products service", () => {
  beforeEach(() => mockedApi.mockReset());

  it("uses read, manual refresh, and local stock-setup endpoints", async () => {
    mockedApi.mockResolvedValue({
      products: [],
      pagination: { totalPages: 1 },
    } as never);
    const setup = {
      baseIngredients: [{ itemId: 2, quantity: 0.25 }],
      sizes: [],
      modifiers: [
        { externalModifierOptionId: 8, stockEffect: "none" as const },
      ],
    };

    await listProducts();
    await refreshProducts();
    await getProductRefreshStatus();
    await configureProductStock(9, setup);

    expect(mockedApi.mock.calls).toEqual([
      ["/api/products?all=true"],
      ["/api/products/refresh", { method: "POST" }],
      ["/api/products/refresh-status", { cache: "no-store" }],
      [
        "/api/products/9/stock-setup",
        { method: "PUT", body: JSON.stringify(setup) },
      ],
    ]);
  });
});
