import { testId } from "@cashier/shared/test-support";
import { describe, expect, it, vi } from "vitest";
import type { SalariesRepository } from "../../src/modules/salaries/salaries.repository.js";
import { SalariesService } from "../../src/modules/salaries/salaries.service.js";

function repository(overrides: Record<string, unknown> = {}) {
  const tx = {
    employeeForUpdate: vi.fn(async () => ({
      id: testId(1),
      name: "أحمد",
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
    createPayment: vi.fn(async () => testId(8)),
    payment: vi.fn(async () => ({ id: testId(8) })),
    latestPaymentForEmployee: vi.fn(async () => undefined),
    createAdvance: vi.fn(async () => ({ id: testId(1) })),
    createAdjustment: vi.fn(async () => ({ id: testId(2) })),
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
    createAdvance: vi.fn(async () => ({ id: testId(1) })),
    createAdjustment: vi.fn(async () => ({ id: testId(2) })),
    latestPaymentForEmployee: vi.fn(async () => undefined),
  } as unknown as SalariesRepository;
  return { repo, tx, service: new SalariesService(repo) };
}

describe("SalariesService", () => {
  it("calculates a monthly payday from salary, bonuses, deductions, and advances", async () => {
    const { service } = repository();
    await expect(service.preview(testId(1), "2026-09")).resolves.toMatchObject({
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
    await expect(service.preview(testId(1), "2026-09")).resolves.toMatchObject({
      advances: "450.00",
      netPay: "4550.00",
    });
  });

  it("rejects payday when no salary has been set", async () => {
    const missing = repository({
      employeeForUpdate: vi.fn(async () => ({
        id: testId(1),
        payRate: null,
      })),
    });
    await expect(missing.service.pay(testId(1), "2026-09", testId(9))).rejects.toMatchObject({
      status: 409,
    });
  });

  it("records one immutable payment snapshot per employee and month", async () => {
    const { service, tx } = repository();
    await expect(service.pay(testId(1), "2026-09", testId(9))).resolves.toEqual({ id: testId(8) });
    expect(tx.createPayment).toHaveBeenCalledWith({
      employeeId: testId(1),
      periodMonth: "2026-09-01",
      basePay: "5000.00",
      bonuses: "300.00",
      deductions: "100.00",
      advances: "500.00",
      netPay: "4700.00",
      paidBy: testId(9),
    });

    const duplicate = repository({
      paymentForMonth: vi.fn(async () => ({ id: testId(7) })),
    });
    await expect(duplicate.service.pay(testId(1), "2026-09", testId(9))).rejects.toMatchObject({
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
        { employeeId: testId(1), amount: 100, entryDate: "2026-09-20", note: null },
        testId(9),
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("explains a blocked row with the real reason instead of blaming the salary", async () => {
    const noSalary = repository();
    vi.mocked(noSalary.repo.listEmployees).mockResolvedValue([
      { id: testId(1), name: "أحمد", isActive: true, payRate: null },
    ]);

    // nothing to calculate: the admin has to set a monthly salary first
    await expect(noSalary.service.month("2026-09")).resolves.toMatchObject({
      employees: [{ employeeId: testId(1), blockedReason: "no_salary" }],
    });

    // a later month was already paid, so this month is closed for good
    const closed = repository();
    vi.mocked(closed.repo.latestPaymentForEmployee).mockResolvedValue({
      periodMonth: "2026-09-01",
    });
    vi.mocked(closed.repo.listEmployees).mockResolvedValue([
      { id: testId(1), name: "أحمد", isActive: true, payRate: "5000.00" },
    ]);

    await expect(closed.service.month("2026-08")).resolves.toMatchObject({
      employees: [{ employeeId: testId(1), blockedReason: "month_closed" }],
    });

    // the numbers themselves are broken: carry the message so the admin can fix it
    const broken = repository({
      monthEntries: vi.fn(async () => ({
        advances: [],
        settledAdvances: "100.00",
        adjustments: [],
      })),
    });
    vi.mocked(broken.repo.listEmployees).mockResolvedValue([
      { id: testId(1), name: "أحمد", isActive: true, payRate: "5000.00" },
    ]);

    await expect(broken.service.month("2026-09")).resolves.toMatchObject({
      employees: [
        {
          employeeId: testId(1),
          blockedReason: "invalid_data",
          blockedMessage: "بيانات السلف السابقة غير متسقة مع الدفعات",
        },
      ],
    });
  });

  it("reports no blocked reason for a paid or payable row", async () => {
    const { repo, service } = repository();
    vi.mocked(repo.listEmployees).mockResolvedValue([
      { id: testId(1), name: "أحمد", isActive: true, payRate: "5000.00" },
    ]);

    await expect(service.month("2026-09")).resolves.toMatchObject({
      employees: [
        {
          employeeId: testId(1),
          netPay: "4700.00",
          blockedReason: null,
          blockedMessage: null,
        },
      ],
    });

    const paid = repository();
    vi.mocked(paid.repo.listPayments).mockResolvedValue([
      {
        id: testId(3),
        employeeId: testId(1),
        basePay: "5000.00",
        bonuses: "0.00",
        deductions: "0.00",
        advances: "0.00",
        netPay: "5000.00",
      },
    ]);
    vi.mocked(paid.repo.listEmployees).mockResolvedValue([
      { id: testId(1), name: "أحمد", isActive: true, payRate: "5000.00" },
    ]);

    await expect(paid.service.month("2026-09")).resolves.toMatchObject({
      employees: [{ employeeId: testId(1), blockedReason: null }],
    });
  });

  it("counts the earlier months a payment would lock for good", async () => {
    const gap = repository();
    vi.mocked(gap.repo.latestPaymentForEmployee).mockResolvedValue({
      periodMonth: "2026-07-01",
    });
    vi.mocked(gap.repo.listEmployees).mockResolvedValue([
      { id: testId(1), name: "أحمد", isActive: true, payRate: "5000.00" },
    ]);

    // paying September locks August: one unpaid month sits between them
    await expect(gap.service.month("2026-09")).resolves.toMatchObject({
      employees: [{ employeeId: testId(1), unpaidEarlierMonths: 1 }],
    });

    const history = repository();
    vi.mocked(history.repo.latestPaymentForEmployee).mockResolvedValue({
      periodMonth: "2026-07-01",
    });
    vi.mocked(history.repo.listEmployees).mockResolvedValue([
      { id: testId(1), name: "أحمد", isActive: true, payRate: "5000.00" },
    ]);

    // August and September both sit unpaid behind October
    await expect(history.service.month("2026-10")).resolves.toMatchObject({
      employees: [{ employeeId: testId(1), unpaidEarlierMonths: 2 }],
    });

    // a consecutive history leaves nothing behind this payment
    const consecutive = repository();
    vi.mocked(consecutive.repo.latestPaymentForEmployee).mockResolvedValue({
      periodMonth: "2026-08-01",
    });
    vi.mocked(consecutive.repo.listEmployees).mockResolvedValue([
      { id: testId(1), name: "أحمد", isActive: true, payRate: "5000.00" },
    ]);

    await expect(consecutive.service.month("2026-09")).resolves.toMatchObject({
      employees: [{ employeeId: testId(1), unpaidEarlierMonths: 0 }],
    });

    // no payment history at all: nothing is being locked behind this one
    const none = repository();
    vi.mocked(none.repo.listEmployees).mockResolvedValue([
      { id: testId(1), name: "أحمد", isActive: true, payRate: "5000.00" },
    ]);

    await expect(none.service.month("2026-09")).resolves.toMatchObject({
      employees: [{ employeeId: testId(1), unpaidEarlierMonths: 0 }],
    });
  });

  it("counts from the hire month when the employee was never paid", async () => {
    const { repo, service } = repository();
    vi.mocked(repo.listEmployees).mockResolvedValue([
      {
        id: testId(1),
        name: "أحمد",
        isActive: true,
        payRate: "5000.00",
        hireDate: "2026-07-15",
      },
    ]);

    // paying September for someone hired in July locks July and August
    await expect(service.month("2026-09")).resolves.toMatchObject({
      employees: [{ employeeId: testId(1), unpaidEarlierMonths: 2 }],
    });

    // the hire month itself leaves nothing behind
    const firstMonth = repository();
    vi.mocked(firstMonth.repo.listEmployees).mockResolvedValue([
      {
        id: testId(1),
        name: "أحمد",
        isActive: true,
        payRate: "5000.00",
        hireDate: "2026-09-30",
      },
    ]);

    await expect(
      firstMonth.service.month("2026-09"),
    ).resolves.toMatchObject({
      employees: [{ employeeId: testId(1), unpaidEarlierMonths: 0 }],
    });

    // hired after the shown month: nothing to lock
    const futureHire = repository();
    vi.mocked(futureHire.repo.listEmployees).mockResolvedValue([
      {
        id: testId(1),
        name: "أحمد",
        isActive: true,
        payRate: "5000.00",
        hireDate: "2026-11-01",
      },
    ]);

    await expect(
      futureHire.service.month("2026-09"),
    ).resolves.toMatchObject({
      employees: [{ employeeId: testId(1), unpaidEarlierMonths: 0 }],
    });

    // a hire month inside the target month still counts nothing
    const midMonth = repository();
    vi.mocked(midMonth.repo.listEmployees).mockResolvedValue([
      {
        id: testId(1),
        name: "أحمد",
        isActive: true,
        payRate: "5000.00",
        hireDate: "2026-09-02",
      },
    ]);

    await expect(
      midMonth.service.month("2026-09"),
    ).resolves.toMatchObject({
      employees: [{ employeeId: testId(1), unpaidEarlierMonths: 0 }],
    });
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
        id: testId(1),
        name: "أحمد",
        isActive: true,
        payRate: "5000.00",
      },
    ]);

    await expect(service.month("2026-09")).resolves.toMatchObject({
      employees: [
        {
          employeeId: testId(1),
          employeeName: "أحمد",
          isActive: true,
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

  it("keeps payday arithmetic on integer cents so 0.30 minus 0.10 minus 0.20 stays payable", async () => {
    const { service } = repository({
      employeeForUpdate: vi.fn(async () => ({
        id: testId(1),
        name: "أحمد",
        payRate: "0.30",
      })),
      monthEntries: vi.fn(async () => ({
        advances: [],
        settledAdvances: "0.00",
        adjustments: [
          { type: "deduction", amount: "0.10" },
          { type: "deduction", amount: "0.20" },
        ],
      })),
    });
    await expect(service.preview(testId(1), "2026-09")).resolves.toMatchObject({
      basePay: "0.30",
      deductions: "0.30",
      advances: "0.00",
      netPay: "0.00",
    });
  });

  it("rejects payday for a month on or before the latest paid month", async () => {
    const { service, tx } = repository({
      latestPaymentForEmployee: vi.fn(async () => ({
        periodMonth: "2026-09-01",
      })),
    });
    await expect(service.pay(testId(1), "2026-08", testId(9))).rejects.toMatchObject({
      status: 409,
    });
    expect(tx.createPayment).not.toHaveBeenCalled();
  });

  it("lists an unpaid earlier month as not payable after a later month is paid", async () => {
    const { repo, service } = repository();
    vi.mocked(repo.latestPaymentForEmployee).mockResolvedValue({
      periodMonth: "2026-09-01",
    });
    vi.mocked(repo.listEmployees).mockResolvedValue([
      {
        id: testId(1),
        name: "أحمد",
        isActive: true,
        payRate: "5000.00",
      },
    ]);

    await expect(service.month("2026-08")).resolves.toMatchObject({
      employees: [
        {
          employeeId: testId(1),
          employeeName: "أحمد",
          basePay: null,
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
        id: testId(1),
        name: "أحمد",
        isActive: true,
        payRate: "5000.00",
      },
    ]);
    await expect(service.month("2026-09")).rejects.toThrow(
      "database unavailable",
    );
  });
});
