import type { Supplier, SupplierStatementMovement } from "@cashier/shared";
import { cairoCalendarLabel } from "@cashier/web-core/lib/cairo-date";
import { formatMoney } from "@cashier/web-core/lib/format";
import { A4Document } from "@/components/print/a4-document";

export function SupplierStatementSlip({
  supplier,
  movements,
  purchasesTotal,
  paymentsTotal,
}: {
  supplier: Supplier;
  movements: SupplierStatementMovement[];
  purchasesTotal: number;
  paymentsTotal: number;
}) {
  return (
    <A4Document
      title="كشف حساب مورد"
      label={`كشف حساب ${supplier.name}`}
      facts={[
        ["المورد", <b key="name">{supplier.name}</b>],
        [
          "الهاتف",
          supplier.phone && (
            <span key="phone" className="tnum" dir="ltr">
              {supplier.phone}
            </span>
          ),
        ],
      ]}
      totals={[
        ["الرصيد الافتتاحي", formatMoney(supplier.openingBalance)],
        ["إجمالي المشتريات", formatMoney(purchasesTotal)],
        ["إجمالي المدفوعات", formatMoney(paymentsTotal)],
        ["الرصيد المستحق", formatMoney(supplier.balance), true],
      ]}
    >
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-y-2 border-ink/40 text-muted">
            <th className="py-2 text-right font-medium">البيان</th>
            <th className="py-2 text-center font-medium">المبلغ</th>
            <th className="py-2 text-left font-medium">الرصيد</th>
          </tr>
        </thead>
        <tbody>
          {movements.map((movement) => (
            <tr key={movement.id} className="align-top">
              <td className="py-2 pe-2">
                <span className="font-medium">{movement.description}</span>
                <span className="tnum block text-xs text-muted">
                  {cairoCalendarLabel(movement.date)}
                </span>
              </td>
              <td className="tnum py-2 text-center">
                {movement.type === "payment" ? "−" : "+"}
                {formatMoney(Math.abs(Number(movement.amount)))}
              </td>
              <td className="tnum py-2 text-left font-medium">
                {formatMoney(movement.balanceAfter)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </A4Document>
  );
}
