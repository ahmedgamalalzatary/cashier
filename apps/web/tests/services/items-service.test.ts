import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../src/lib/api";
import {
  createItem,
  deactivateItem,
  listItems,
  reactivateItem,
  updateItem,
} from "../../src/services/items-service";

vi.mock("../../src/lib/api", () => ({ api: vi.fn() }));

describe("items service", () => {
  const request = vi.mocked(api);

  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue(undefined as never);
  });

  it("lists items", async () => {
    await listItems();
    expect(request).toHaveBeenCalledWith("/api/items");
  });

  it("creates and updates items", async () => {
    const createBody = { name: "Milk", categoryId: 2 };
    const updateBody = { name: "Whole milk" };
    await createItem(createBody);
    await updateItem(9, updateBody);
    expect(request).toHaveBeenNthCalledWith(1, "/api/items", {
      method: "POST",
      body: JSON.stringify(createBody),
    });
    expect(request).toHaveBeenNthCalledWith(2, "/api/items/9", {
      method: "PUT",
      body: JSON.stringify(updateBody),
    });
  });

  it("deactivates and reactivates items", async () => {
    await deactivateItem(9);
    await reactivateItem(10);
    expect(request).toHaveBeenNthCalledWith(1, "/api/items/9", {
      method: "DELETE",
    });
    expect(request).toHaveBeenNthCalledWith(2, "/api/items/10", {
      method: "PUT",
      body: JSON.stringify({ isActive: true }),
    });
  });
});
