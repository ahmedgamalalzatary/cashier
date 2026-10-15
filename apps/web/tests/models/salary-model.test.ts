import { testId } from "@cashier/shared/test-support";
import { describe, expect, it } from "vitest";
import type { SalaryMonthEmployee } from "@cashier/shared";
import { formatMoney } from "@cashier/web-core/lib/format";
import {
  payConfirmationText,
  salaryBlockedLabel,
  salaryPaidSoFar,
  salaryRemaining,
  salaryRemainingCell,
} from "../../src/models/salary-model";

const row = (
  over: Partial<SalaryMonthEmployee> = {},
): SalaryMonthEmployee => ({
  employeeId: testId(1),
  employeeName: "أحمد",
  isActive: true,
  payRate: "5000.00",
  basePay: "5000.00",
  bonuses: "0.00",
  deductions: "0.00",
  advances: "0.00",
  netPay: "5000.00",
  payment: null,
  blockedReason: null,
  blockedMessage: null,
  unpaidEarlierMonths: 0,
  ...over,
});

describe("salary blocked reason", () => {
  // a blocked row never carries a figure: basePay and netPay are both null
  const blockedRow = (over: Partial<SalaryMonthEmployee> = {}) =>
    row({ basePay: null, netPay: null, ...over });

  it("asks for a salary only when the salary is the problem", () => {
    expect(salaryBlockedLabel(blockedRow({ blockedReason: "no_salary" }))).toBe(
      "حدد الراتب الشهري",
    );
  });

  it("says a later payment closed this month instead of blaming the salary", () => {
    expect(salaryBlockedLabel(blockedRow({ blockedReason: "month_closed" }))).toBe(
      "مغلق — تم صرف شهر لاحق",
    );
  });

  it("passes the real problem through when the numbers are broken", () => {
    expect(
      salaryBlockedLabel(
        blockedRow({
          blockedReason: "invalid_data",
          blockedMessage: "بيانات السلف السابقة غير متسقة مع الدفعات",
        }),
      ),
    ).toBe("بيانات السلف السابقة غير متسقة مع الدفعات");
  });

  it("says nothing for a payable or already paid row", () => {
    expect(salaryBlockedLabel(row())).toBeNull();
    expect(
      salaryBlockedLabel(
        row({ blockedReason: "invalid_data", blockedMessage: null }),
      ),
    ).toBeNull();
  });
});

describe("pay confirmation", () => {
  const confirmation = (unpaidEarlierMonths: number) =>
    payConfirmationText({
      name: "أحمد",
      month: "2026-09",
      netPay: "4700.00",
      unpaidEarlierMonths,
    });

  it("states how much is being paid", () => {
    const text = confirmation(0);

    expect(text).toContain("صرف راتب أحمد");
    expect(text).toContain("2026-09");
    expect(text).toContain(formatMoney("4700.00"));
  });

  it("stays quiet when no earlier month is left behind", () => {
    expect(confirmation(0)).not.toContain("تنبيه");
  });

  it("warns that paying now locks the unpaid earlier months for good", () => {
    expect(confirmation(2)).toContain("تنبيه");
    expect(confirmation(1)).toContain("شهر واحد سابق غير مدفوع");
    // dual takes the dual of مدفوع, not its broken plural
    expect(confirmation(2)).toContain("شهرين سابقين غير مدفوعين");
    expect(confirmation(3)).toContain("3 أشهر سابقة غير مدفوعة");
    // 11 and up take a singular counted noun, so the adjective is genitive
    expect(confirmation(12)).toContain("12 شهراً سابقاً غير مدفوع");
    expect(confirmation(11)).toContain("11 شهراً سابقاً غير مدفوع");
    expect(confirmation(10)).toContain("10 أشهر سابقة غير مدفوعة");
  });
});

describe("advance figures", () => {
  it("shows how much was paid so far and what remains of an unpaid month", () => {
    const example = row({ advances: "2000.00", netPay: "3000.00" });
    expect(salaryPaidSoFar(example)).toBe(formatMoney("2000.00"));
    expect(salaryRemaining(example)).toBe("3000.00");
  });

  it("shows the payment itself for a paid month, not a remaining figure", () => {
    const paid = row({
      advances: "500.00",
      netPay: "4500.00",
      payment: {
        id: "p1",
        employeeId: row().employeeId,
        employeeName: "أحمد",
        periodMonth: "2026-09-01",
        basePay: "5000.00",
        bonuses: "0.00",
        deductions: "0.00",
        advances: "500.00",
        netPay: "4500.00",
        paidByName: "مدير",
        paidAt: "2026-10-01T00:00:00",
      },
    });
    expect(salaryPaidSoFar(paid)).toBe(formatMoney("4500.00"));
    expect(salaryRemaining(paid)).toBeNull();
  });
});

describe("remaining column", () => {
  it("says paid only for a real payment", () => {
    const paidRow = row({
      netPay: "4500.00",
      payment: {
        id: "p1",
        employeeId: row().employeeId,
        employeeName: "أحمد",
        periodMonth: "2026-09-01",
        basePay: "5000.00",
        bonuses: "0.00",
        deductions: "0.00",
        advances: "500.00",
        netPay: "4500.00",
        paidByName: "مدير",
        paidAt: "2026-10-01T00:00:00",
      },
    });
    expect(salaryRemainingCell(paidRow)).toEqual({ kind: "paid" });
  });

  it("shows the amount for a payable month", () => {
    expect(salaryRemainingCell(row({ netPay: "3000.00" }))).toEqual({
      kind: "amount",
      value: "3000.00",
    });
  });

  it("shows the blocking reason instead of treating it as paid", () => {
    const blockedRow = row({
      basePay: null,
      netPay: null,
      blockedReason: "no_salary",
    });
    expect(salaryRemainingCell(blockedRow)).toEqual({
      kind: "blocked",
      label: "حدد الراتب الشهري",
    });
    expect(
      salaryRemainingCell(
        row({ basePay: null, netPay: null, blockedReason: null }),
      ),
    ).toEqual({ kind: "blocked", label: null });
  });
});