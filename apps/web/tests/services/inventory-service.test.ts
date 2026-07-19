import { describe, expect, it, vi } from "vitest";
import { api } from "../../src/lib/api";
import { getMainWarehouseStock } from "../../src/services/inventory-service";

vi.mock("../../src/lib/api", () => ({ api: vi.fn() }));

describe("inventory service", () => {
  it("loads main warehouse stock", async () => {
    vi.mocked(api).mockResolvedValue(undefined as never);
    await getMainWarehouseStock();
    expect(api).toHaveBeenCalledWith("/api/inventory/main/stock");
  });
});
