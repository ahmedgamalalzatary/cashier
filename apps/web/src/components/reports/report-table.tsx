import { formatMoney } from "../../lib/format";
import type { ReportTable as ReportTableData } from "../../models/reports-model";
import { Table } from "../ui/table";
const arabicNumber = new Intl.NumberFormat("ar-EG", {
  maximumFractionDigits: 3,
});
const eventLabels: Record<string, string> = {
  sale: "بيع",
  refund: "مرتجع",
  expense: "مصروف",
  supplier_payment: "دفعة مورد",
  purchase: "شراء",
  transfer_out: "تحويل صادر",
  transfer_in: "تحويل وارد",
  order: "بيع",
  waste: "هالك",
  preparation_out: "استهلاك تحضير",
  preparation_in: "إنتاج تحضير",
  refund_return: "إرجاع للمخزون",
  adjustment: "تسوية جرد",
  stocktake_shortage: "عجز جرد",
  stocktake_surplus: "زيادة جرد",
  salary_payment: "صرف راتب",
  salary_advance: "سلفة موظف",
  purchase_invoice: "فاتورة شراء",
  preparation: "تحضير",
  transfer: "تحويل",
  stocktake: "جرد مخزون",
};
// The stocktake document kind shares its vocabulary with nothing else, so it
// gets its own map rather than borrowing the movement/reference labels.
const stocktakeKindLabels: Record<string, string> = {
  stocktake: "جرد مخزون",
  manual: "تسوية يدوية",
};
const salaryHistoryLabels: Record<string, string> = {
  payment: "صرف راتب",
  advance: "سلفة",
  bonus: "مكافأة",
  deduction: "خصم",
};
// Waste stores an enum code in `reason`; a refund stores free-typed text, so
// the same map must never rewrite a refund reason the cashier actually wrote.
const wasteReasonLabels: Record<string, string> = {
  expired: "منتهي الصلاحية",
  damaged: "تالف",
  preparation_mistake: "خطأ تحضير",
  spill: "انسكاب",
  other: "سبب آخر",
};
const labelSets: Record<string, Record<string, string>> = {
  movement: eventLabels,
  reference: eventLabels,
  cashFlow: eventLabels,
  stocktakeKind: stocktakeKindLabels,
  salaryHistory: salaryHistoryLabels,
  wasteReason: wasteReasonLabels,
  status: {
    open: "مفتوحة",
    closed: "مغلقة",
    pending: "قيد المراجعة",
    approved: "معتمد",
    rejected: "مرفوض",
    draft: "مسودة",
    confirmed: "مؤكد",
  },
  shiftAction: {
    open: "فتح",
    close: "إغلاق",
    admin_close: "إغلاق إداري",
    reopen: "إعادة فتح",
    correction: "تصحيح",
  },
  expenseType: { shift: "مصروف وردية", general: "مصروف عام" },
};
function valueOf(
  value: string | number | null,
  kind?: string,
  labelSet?: string,
) {
  if (value == null || value === "") return "—";
  if (kind === "money") return formatMoney(value);
  if (kind === "number") return arabicNumber.format(Number(value));
  if (kind === "date") {
    const options = { timeZone: "Africa/Cairo" };
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T12:00:00Z`).toLocaleDateString("ar-EG", options)
      : new Date(value).toLocaleString("ar-EG", options);
  }
  if (kind === "warehouse") return value === "main" ? "الرئيسي" : "الكافيه";
  if (kind === "event") {
    const set = labelSet ? labelSets[labelSet] : eventLabels;
    return set?.[String(value)] ?? String(value);
  }
  return String(value);
}
export function ReportTable({ title, rows, columns, note }: ReportTableData) {
  return (
    <section className="break-inside-avoid space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-bold">{title}</h2>
        <span className="text-xs text-muted">{rows.length} سجل</span>
      </div>
      {note && <p className="text-sm text-muted">{note}</p>}
      {rows.length ? (
        <Table headers={columns.map((column) => column.label)}>
          {rows.map((row, index) => (
            <tr key={`${title}-${index}`}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={
                    column.kind === "money" || column.kind === "number"
                      ? "tnum"
                      : ""
                  }
                >
                  {valueOf(row[column.key], column.kind, column.labelSet)}
                </td>
              ))}
            </tr>
          ))}
        </Table>
      ) : (
        <p className="rounded-xl border border-dashed border-line p-5 text-center text-sm text-muted">
          لا توجد بيانات
        </p>
      )}
    </section>
  );
}
