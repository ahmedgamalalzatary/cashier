import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../src/lib/api";
import {
  createCategory,
  deactivateCategory,
  listCategories,
  reactivateCategory,
  updateCategory,
} from "../../src/services/categories-service";

vi.mock("../../src/lib/api", () => ({ api: vi.fn() }));

describe("categories service", () => {
  const request = vi.mocked(api);

  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue(undefined as never);
  });

  it("lists categories", async () => {
    await listCategories();
    expect(request).toHaveBeenCalledWith("/api/categories");
  });

  it("creates a category", async () => {
    await createCategory({ name: "Drinks", parentId: null });
    expect(request).toHaveBeenCalledWith("/api/categories", {
      method: "POST",
      body: JSON.stringify({ name: "Drinks", parentId: null }),
    });
  });

  it("updates a category", async () => {
    await updateCategory(4, { name: "Coffee", parentId: 2 });
    expect(request).toHaveBeenCalledWith("/api/categories/4", {
      method: "PUT",
      body: JSON.stringify({ name: "Coffee", parentId: 2 }),
    });
  });

  it("deactivates and reactivates a category", async () => {
    await deactivateCategory(4);
    await reactivateCategory(5);
    expect(request).toHaveBeenNthCalledWith(1, "/api/categories/4", {
      method: "DELETE",
    });
    expect(request).toHaveBeenNthCalledWith(2, "/api/categories/5", {
      method: "PUT",
      body: JSON.stringify({ isActive: true }),
    });
  });
});
