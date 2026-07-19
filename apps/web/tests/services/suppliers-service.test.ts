import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../src/lib/api";
import {
  createSupplier,
  deactivateSupplier,
  getSupplierStatement,
  listSuppliers,
  reactivateSupplier,
  recordSupplierPayment,
  updateSupplier,
} from "../../src/services/suppliers-service";

vi.mock("../../src/lib/api", () => ({ api: vi.fn() }));

describe("suppliers service", () => {
  const request = vi.mocked(api);

  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue(undefined as never);
  });

  it("lists suppliers and loads a statement", async () => {
    await listSuppliers();
    await getSupplierStatement(7);
    expect(request).toHaveBeenNthCalledWith(1, "/api/suppliers");
    expect(request).toHaveBeenNthCalledWith(2, "/api/suppliers/7/statement");
  });

  it("creates and updates suppliers", async () => {
    const createBody = { name: "Beans", openingBalance: 10 };
    const updateBody = { name: "Coffee Beans" };
    await createSupplier(createBody);
    await updateSupplier(7, updateBody);
    expect(request).toHaveBeenNthCalledWith(1, "/api/suppliers", {
      method: "POST",
      body: JSON.stringify(createBody),
    });
    expect(request).toHaveBeenNthCalledWith(2, "/api/suppliers/7", {
      method: "PUT",
      body: JSON.stringify(updateBody),
    });
  });

  it("deactivates and reactivates suppliers", async () => {
    await deactivateSupplier(7);
    await reactivateSupplier(8);
    expect(request).toHaveBeenNthCalledWith(1, "/api/suppliers/7", {
      method: "DELETE",
    });
    expect(request).toHaveBeenNthCalledWith(2, "/api/suppliers/8", {
      method: "PUT",
      body: JSON.stringify({ isActive: true }),
    });
  });

  it("records supplier payments", async () => {
    const body = { amount: 100, paidAt: "2026-07-19", notes: "cash" };
    await recordSupplierPayment(7, body);
    expect(request).toHaveBeenCalledWith("/api/suppliers/7/payments", {
      method: "POST",
      body: JSON.stringify(body),
    });
  });
});
