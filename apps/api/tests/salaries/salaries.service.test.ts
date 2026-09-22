import { describe, expect, it, vi } from "vitest";
import type { SalariesRepository } from "../../src/modules/salaries/salaries.repository.js";
import { SalariesService } from "../../src/modules/salaries/salaries.service.js";

function repository(overrides: Record<string, unknown> = {}) {
  const tx = {
    employeeForUpdate: vi.fn(async () => ({
      id: 1,
      name: "أحمد",
      payType: "monthly",
      payRate: "5000.00",
    })),
    monthEntries: vi.fn(async () => ({
      advances: [{ amount: "500.00" }],
      settledAdvances: "0.00",
      adjustments: [
        { type: "bonus", amount: "300.00" },
        { type: "deduction", amount: "100.00" },
      ],
    })),
    paymentForMonth: vi.fn(async () => undefined),
    createPayment: vi.fn(async () => 8),
    payment: vi.fn(async () => ({ id: 8 })),
    latestPaymentForEmployee: vi.fn(async () => undefined),
    createAdvance: vi.fn(async () => ({ id: 1 })),
    createAdjustment: vi.fn(async () => ({ id: 2 })),
    ...overrides,
  };
  const repo = {
    transaction: vi.fn(async (run) => run(tx)),
    monthEntries: tx.monthEntries,
    employee: tx.employeeForUpdate,
    listEmployees: vi.fn(async () => []),
    listAdvances: vi.fn(async () => []),
    listAdjustments: vi.fn(async () => []),
    listPayments: vi.fn(async () => []),
    createAdvance: vi.fn(async () => ({ id: 1 })),
    createAdjustment: vi.fn(async () => ({ id: 2 })),
    latestPaymentForEmployee: vi.fn(async () => undefined),
  } as unknown as SalariesRepository;
  return { repo, tx, service: new SalariesService(repo) };
}

describe("SalariesService", () => {
  it("calculates a monthly payday from salary, bonuses, deductions, and advances", async () => {
    const { service } = repository();
    await expect(service.preview(1, "2026-09")).resolves.toMatchObject({
      basePay: "5000.00",
      bonuses: "300.00",
      deductions: "100.00",
      advances: "500.00",
      netPay: "4700.00",
    });
  });

  it("carries earlier unpaid advances forward and excludes advances settled by prior paydays", async () => {
    const { service } = repository({
      monthEntries: vi.fn(async () => ({
        advances: [{ amount: "300.00" }, { amount: "450.00" }],
        settledAdvances: "300.00",
        adjustments: [],
      })),
    });
    await expect(service.preview(1, "2026-09")).resolves.toMatchObject({
      advances: "450.00",
      netPay: "4550.00",
    });
  });

  it("rejects payday when monthly salary is missing or not monthly", async () => {
    const missing = repository({
      employeeForUpdate: vi.fn(async () => ({
        id: 1,
        payType: null,
        payRate: null,
      })),
    });
    await expect(missing.service.pay(1, "2026-09", 9)).rejects.toMatchObject({
      status: 409,
    });

    const legacy = repository({
      employeeForUpdate: vi.fn(async () => ({
        id: 1,
        payType: "daily",
        payRate: "200.00",
      })),
    });
    await expect(legacy.service.pay(1, "2026-09", 9)).rejects.toMatchObject({
      status: 409,
    });
  });

  it("records one immutable payment snapshot per employee and month", async () => {
    const { service, tx } = repository();
    await expect(service.pay(1, "2026-09", 9)).resolves.toEqual({ id: 8 });
    expect(tx.createPayment).toHaveBeenCalledWith({
      employeeId: 1,
      periodMonth: "2026-09-01",
      basePay: "5000.00",
      bonuses: "300.00",
      deductions: "100.00",
      advances: "500.00",
      netPay: "4700.00",
      paidBy: 9,
    });

    const duplicate = repository({
      paymentForMonth: vi.fn(async () => ({ id: 7 })),
    });
    await expect(duplicate.service.pay(1, "2026-09", 9)).rejects.toMatchObject({
      status: 409,
    });
  });

  it("rejects backdated entries in a month whose salary is already paid", async () => {
    const { service } = repository({
      latestPaymentForEmployee: vi.fn(async () => ({
        periodMonth: "2026-09-01",
      })),
    });
    await expect(
      service.advance(
        { employeeId: 1, amount: 100, entryDate: "2026-09-20", note: null },
        9,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("lists a monthly employee as not payable when preview calculation returns 409", async () => {
    const { repo, service } = repository({
      monthEntries: vi.fn(async () => ({
        advances: [],
        settledAdvances: "100.00",
        adjustments: [],
      })),
    });
    vi.mocked(repo.listEmployees).mockResolvedValue([
      {
        id: 1,
        name: "أحمد",
        isActive: true,
        payType: "monthly",
        payRate: "5000.00",
      },
    ]);

    await expect(service.month("2026-09")).resolves.toMatchObject({
      employees: [
        {
          employeeId: 1,
          employeeName: "أحمد",
          isActive: true,
          payType: "monthly",
          payRate: "5000.00",
          basePay: null,
          bonuses: "0.00",
          deductions: "0.00",
          advances: "0.00",
          netPay: null,
          payment: null,
        },
      ],
    });
  });

  it("does not hide non-409 month calculation failures", async () => {
    const { repo, service } = repository({
      monthEntries: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    });
    vi.mocked(repo.listEmployees).mockResolvedValue([
      {
        id: 1,
        name: "أحمد",
        isActive: true,
        payType: "monthly",
        payRate: "5000.00",
      },
    ]);
    await expect(service.month("2026-09")).rejects.toThrow(
      "database unavailable",
    );
  });
});
