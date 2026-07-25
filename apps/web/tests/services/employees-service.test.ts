import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../src/lib/api";
import {
  createEmployee,
  deactivateEmployee,
  grantCashierAccess,
  listEmployees,
  revokeCashierAccess,
  updateEmployee,
} from "../../src/services/employees-service";

vi.mock("../../src/lib/api", () => ({ api: vi.fn() }));
const request = vi.mocked(api);

describe("employees service", () => {
  beforeEach(() => request.mockReset().mockResolvedValue(undefined as never));

  it("uses employee profile and cashier-access endpoints", async () => {
    const employee = { name: "أحمد", jobTitle: "كاشير" };
    const access = { username: "ahmed", password: "secret123" };
    await listEmployees();
    await createEmployee(employee);
    await updateEmployee(4, employee);
    await grantCashierAccess(4, access);
    await revokeCashierAccess(4);
    await deactivateEmployee(4);

    expect(request.mock.calls).toEqual([
      ["/api/employees"],
      ["/api/employees", { method: "POST", body: JSON.stringify(employee) }],
      ["/api/employees/4", { method: "PUT", body: JSON.stringify(employee) }],
      [
        "/api/employees/4/cashier-access",
        { method: "POST", body: JSON.stringify(access) },
      ],
      ["/api/employees/4/cashier-access", { method: "DELETE" }],
      ["/api/employees/4", { method: "DELETE" }],
    ]);
  });
});
