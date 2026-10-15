import type { SalaryPayment } from "@cashier/shared";
import { formatMoney } from "@cashier/web-core/lib/format";
import { A4Document } from "@/components/print/a4-document";

const monthName = new Intl.DateTimeFormat("ar-EG", {
  month: "long",
  year: "numeric",
});

const paidAt = new Intl.DateTimeFormat("ar-EG", {
  timeZone: "Africa/Cairo",
  dateStyle: "medium",
});

function monthLabel(periodMonth: string) {
  const [year, month] = periodMonth.split("-").map(Number);
  return monthName.format(new Date(year, month - 1, 1));
}

/** The A4 payslip built from the stored payment row, so figures match it. */
export function SalaryPayslip({ payment }: { payment: SalaryPayment }) {
  return (
    <A4Document
      title="قسيمة راتب"
      label={`قسيمة راتب ${payment.employeeName}`}
      facts={[
        ["الموظف", <b key="name">{payment.employeeName}</b>],
        ["الشهر", monthLabel(payment.periodMonth)],
        ["صُرف بواسطة", payment.paidByName],
        [
          "تاريخ الصرف",
          <span key="paid" className="tnum">
            {paidAt.format(new Date(payment.paidAt))}
          </span>,
        ],
      ]}
      totals={[
        ["الراتب الأساسي", formatMoney(payment.basePay)],
        ["المكافآت", formatMoney(payment.bonuses)],
        ["الخصومات", formatMoney(payment.deductions)],
        ["السلف", formatMoney(payment.advances)],
        ["الصافي", formatMoney(payment.netPay), true],
      ]}
      signatures={["استلمت / التوقيع"]}
    />
  );
}
