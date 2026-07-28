import { describe, expect, it, vi } from "vitest";
import { api } from "../../src/lib/api";
import {
  getShopWarehouseStock,
  getMainWarehouseStock,
} from "../../src/services/inventory-service";

vi.mock("../../src/lib/api", () => ({ api: vi.fn() }));

describe("inventory service", () => {
  it("loads main warehouse stock", async () => {
    vi.mocked(api).mockResolvedValue(undefined as never);
    await getMainWarehouseStock();
    expect(api).toHaveBeenCalledWith("/api/inventory/main/stock");
  });

  it("loads shop warehouse stock", async () => {
    vi.mocked(api).mockResolvedValue(undefined as never);
    await getShopWarehouseStock();
    expect(api).toHaveBeenCalledWith("/api/inventory/shop/stock");
  });
});
