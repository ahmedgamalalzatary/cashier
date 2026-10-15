import { testId } from "@cashier/shared/test-support";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SalaryPayment } from "@cashier/shared";
import { formatMoney } from "@cashier/web-core/lib/format";
import { SalaryPayslip } from "../../../src/components/salaries/salary-payslip";

const payment = {
  id: testId(1),
  employeeId: testId(2),
  employeeName: "سارة",
  periodMonth: "2026-10",
  basePay: "5000.00",
  bonuses: "300.00",
  deductions: "100.00",
  advances: "200.00",
  netPay: "5000.00",
  paidByName: "مدير",
  paidAt: "2026-10-03T10:00:00.000Z",
} satisfies SalaryPayment;

describe("salary payslip (A4)", () => {
  it("prints the stored payment figures exactly", () => {
    const html = renderToStaticMarkup(<SalaryPayslip payment={payment} />);

    expect(html).toContain("a4-print-root");
    expect(html).not.toContain("receipt-print-root");
    expect(html).toContain("قسيمة راتب");
    expect(html).toContain("سارة");
    expect(html).toContain("مدير");
    expect(html).toContain(formatMoney(payment.basePay));
    expect(html).toContain(formatMoney(payment.bonuses));
    expect(html).toContain(formatMoney(payment.deductions));
    expect(html).toContain(formatMoney(payment.advances));
    expect(html).toContain(formatMoney(payment.netPay));
    expect(html).toContain("التوقيع");
  });
});
