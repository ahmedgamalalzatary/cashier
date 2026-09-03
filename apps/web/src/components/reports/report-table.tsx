import { Table } from "@/components/ui/table";
import { formatMoney } from "@/lib/format";
import type { ReportTable as ReportTableData } from "@/models/reports-model";
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
};
function valueOf(value: string | number | null, kind?: string) {
  if (value == null || value === "") return "—";
  if (kind === "money") return formatMoney(value);
  if (kind === "number") return arabicNumber.format(Number(value));
  if (kind === "date") return new Date(value).toLocaleString("ar-EG");
  if (kind === "warehouse") return value === "main" ? "الرئيسي" : "الكافيه";
  if (kind === "event") return eventLabels[String(value)] ?? String(value);
  return String(value);
}
export function ReportTable({ title, rows, columns }: ReportTableData) {
  return (
    <section className="break-inside-avoid space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-bold">{title}</h2>
        <span className="text-xs text-muted">{rows.length} سجل</span>
      </div>
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
                  {valueOf(row[column.key], column.kind)}
                </td>
              ))}
            </tr>
          ))}
        </Table>
      ) : (
        <p className="rounded-xl border border-dashed border-line p-5 text-center text-sm text-muted">
          لا توجد بيانات في الفترة المحددة
        </p>
      )}
    </section>
  );
}
