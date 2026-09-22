import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../src/lib/api", () => ({ api: vi.fn() }));
import { api } from "../../src/lib/api";
import { getSalaryMonth, paySalary } from "../../src/services/salaries-service";

describe("salaries service", () => {
  beforeEach(() => vi.mocked(api).mockReset());
  it("requests a month preview and confirms its employee payment", async () => {
    vi.mocked(api).mockResolvedValue({});
    await getSalaryMonth("2026-09");
    expect(api).toHaveBeenCalledWith("/api/salaries?month=2026-09");
    await paySalary(4, "2026-09");
    expect(api).toHaveBeenCalledWith("/api/salaries/payments", {
      method: "POST",
      body: JSON.stringify({ employeeId: 4, month: "2026-09" }),
    });
  });
});
