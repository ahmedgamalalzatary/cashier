import { testId } from "@cashier/shared/test-support";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@cashier/web-core/lib/api";
import {
  createItem,
  deactivateItem,
  listItems,
  reactivateItem,
  updateItem,
} from "../../src/services/items-service";

vi.mock("@cashier/web-core/lib/api", () => ({ api: vi.fn() }));

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
    const createBody = { name: "Milk", categoryId: testId(2) };
    const updateBody = { name: "Whole milk" };
    await createItem(createBody);
    await updateItem(testId(9), updateBody);
    expect(request).toHaveBeenNthCalledWith(1, "/api/items", {
      method: "POST",
      body: JSON.stringify(createBody),
    });
    expect(request).toHaveBeenNthCalledWith(2, "/api/items/00000000-0000-7000-8000-000000000009", {
      method: "PUT",
      body: JSON.stringify(updateBody),
    });
  });

  it("deactivates and reactivates items", async () => {
    await deactivateItem(testId(9));
    await reactivateItem(testId(10));
    expect(request).toHaveBeenNthCalledWith(1, "/api/items/00000000-0000-7000-8000-000000000009", {
      method: "DELETE",
    });
    expect(request).toHaveBeenNthCalledWith(2, "/api/items/00000000-0000-7000-8000-00000000000a", {
      method: "PUT",
      body: JSON.stringify({ isActive: true }),
    });
  });
});
