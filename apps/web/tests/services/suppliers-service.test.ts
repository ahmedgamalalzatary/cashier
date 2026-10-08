import { testId } from "@cashier/shared/test-support";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@cashier/web-core/lib/api";
import {
  createSupplier,
  deactivateSupplier,
  getSupplierStatement,
  listSuppliers,
  reactivateSupplier,
  recordSupplierPayment,
  updateSupplier,
} from "../../src/services/suppliers-service";

vi.mock("@cashier/web-core/lib/api", () => ({ api: vi.fn() }));

describe("suppliers service", () => {
  const request = vi.mocked(api);

  beforeEach(() => {
    request.mockReset();
    request.mockResolvedValue(undefined as never);
  });

  it("lists suppliers and loads a statement", async () => {
    await listSuppliers();
    await getSupplierStatement(testId(7));
    expect(request).toHaveBeenNthCalledWith(1, "/api/suppliers");
    expect(request).toHaveBeenNthCalledWith(2, "/api/suppliers/00000000-0000-7000-8000-000000000007/statement");
  });

  it("creates and updates suppliers", async () => {
    const createBody = { name: "Beans", openingBalance: 10 };
    const updateBody = { name: "Coffee Beans" };
    await createSupplier(createBody);
    await updateSupplier(testId(7), updateBody);
    expect(request).toHaveBeenNthCalledWith(1, "/api/suppliers", {
      method: "POST",
      body: JSON.stringify(createBody),
    });
    expect(request).toHaveBeenNthCalledWith(2, "/api/suppliers/00000000-0000-7000-8000-000000000007", {
      method: "PUT",
      body: JSON.stringify(updateBody),
    });
  });

  it("deactivates and reactivates suppliers", async () => {
    await deactivateSupplier(testId(7));
    await reactivateSupplier(testId(8));
    expect(request).toHaveBeenNthCalledWith(1, "/api/suppliers/00000000-0000-7000-8000-000000000007", {
      method: "DELETE",
    });
    expect(request).toHaveBeenNthCalledWith(2, "/api/suppliers/00000000-0000-7000-8000-000000000008", {
      method: "PUT",
      body: JSON.stringify({ isActive: true }),
    });
  });

  it("records supplier payments", async () => {
    const body = { amount: 100, paidAt: "2026-07-19", notes: "cash" };
    await recordSupplierPayment(testId(7), body);
    expect(request).toHaveBeenCalledWith("/api/suppliers/00000000-0000-7000-8000-000000000007/payments", {
      method: "POST",
      body: JSON.stringify(body),
    });
  });
});
