import { testId } from "@cashier/shared/test-support";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@cashier/web-core/lib/api";
import {
  type CategoryUpdateBody,
  createCategory,
  deactivateCategory,
  listCategories,
  reactivateCategory,
  updateCategory,
} from "../../src/services/categories-service";

const validReactivation: CategoryUpdateBody = { isActive: true };
// @ts-expect-error Deactivation must use deactivateCategory/DELETE.
const invalidPutDeactivation: CategoryUpdateBody = { isActive: false };
void validReactivation;
void invalidPutDeactivation;

vi.mock("@cashier/web-core/lib/api", () => ({ api: vi.fn() }));

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
    await updateCategory(testId(4), { name: "Coffee", parentId: testId(2) });
    expect(request).toHaveBeenCalledWith("/api/categories/00000000-0000-7000-8000-000000000004", {
      method: "PUT",
      body: JSON.stringify({ name: "Coffee", parentId: testId(2) }),
    });
  });

  it("deactivates and reactivates a category", async () => {
    await deactivateCategory(testId(4));
    await reactivateCategory(testId(5));
    expect(request).toHaveBeenNthCalledWith(1, "/api/categories/00000000-0000-7000-8000-000000000004", {
      method: "DELETE",
    });
    expect(request).toHaveBeenNthCalledWith(2, "/api/categories/00000000-0000-7000-8000-000000000005", {
      method: "PUT",
      body: JSON.stringify({ isActive: true }),
    });
  });
});
