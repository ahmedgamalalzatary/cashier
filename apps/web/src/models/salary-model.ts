import type { SalaryMonthEmployee } from "@cashier/shared";
import { formatMoney } from "@/lib/format";

/**
 * The month sheet used to print "يلزم راتب شهري" for every blocked row, so an
 * admin whose month was already locked by a later payment went looking for a
 * missing salary that was never the problem.
 */
export function salaryBlockedLabel(
  row: Pick<
    SalaryMonthEmployee,
    "blockedReason" | "blockedMessage" | "netPay" | "payment"
  >,
): string | null {
  if (row.payment || row.netPay !== null) return null;
  switch (row.blockedReason) {
    case "no_salary":
      return "حدد الراتب الشهري";
    case "month_closed":
      return "مغلق — تم صرف شهر لاحق";
    case "invalid_data":
      return row.blockedMessage;
    default:
      return null;
  }
}

/** Arabic counted form: one, two, 3–10 plural, 11+ singular */
function earlierMonthsPhrase(count: number): string {
  if (count === 1) return "شهر واحد سابق غير مدفوع";
  if (count === 2) return "شهرين سابقين غير مدفوقين";
  if (count <= 10) return `${count} أشهر سابقة غير مدفوعة`;
  return `${count} شهراً سابقاً غير مدفوعاً`;
}

export function payConfirmationText({
  name,
  month,
  netPay,
  unpaidEarlierMonths,
}: {
  name: string;
  month: string;
  netPay: string;
  unpaidEarlierMonths: number;
}): string {
  const base = `تأكيد صرف راتب ${name} عن ${month}؟ الصافي ${formatMoney(netPay)}. لا يمكن تعديل الدفعة بعد ذلك.`;
  if (unpaidEarlierMonths <= 0) return base;
  return `${base} تنبيه: صرف هذا الشهر سيُقفل ${earlierMonthsPhrase(
    unpaidEarlierMonths,
  )} نهائياً ولن يمكن دفعه لاحقاً.`;
}