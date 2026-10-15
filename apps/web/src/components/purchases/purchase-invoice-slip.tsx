import type { PurchaseInvoiceDetail } from "@cashier/shared";
import { formatMoney, itemLabel } from "@cashier/web-core/lib/format";
import { A4Document } from "@/components/print/a4-document";
import { slipQuantity } from "@/components/print/print-slip";

export function PurchaseInvoiceSlip({
  invoice,
}: {
  invoice: PurchaseInvoiceDetail;
}) {
  const number = invoice.invoiceNumber || `#${invoice.id}`;
  return (
    <A4Document
      title="فاتورة شراء"
      label={`فاتورة شراء ${number}`}
      facts={[
        [
          "رقم الفاتورة",
          <b key="number" className="tnum" dir="ltr">
            {number}
          </b>,
        ],
        ["المورد", invoice.supplierName],
        ["تاريخ الشراء", <span key="date" className="tnum">{invoice.purchasedAt}</span>],
        ["سجلها", invoice.createdByName],
      ]}
      totals={[
        ["الإجمالي", formatMoney(invoice.totalAmount), true],
        ["المدفوع عند الشراء", formatMoney(invoice.paidAmount)],
        ["الآجل عند التسجيل", formatMoney(invoice.dueAmount), true],
      ]}
    >
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-y-2 border-ink/40 text-muted">
            <th className="py-2 text-right font-medium">الصنف</th>
            <th className="py-2 text-center font-medium">الكمية</th>
            <th className="py-2 text-left font-medium">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.map((line) => (
            <tr key={line.id} className="align-top">
              <td className="py-2 pe-2">
                <span className="font-medium">
                  {itemLabel(line.itemCode, line.itemName)}
                </span>
                <span className="block text-xs text-muted">
                  {formatMoney(line.unitPrice)} / {line.unitName}
                </span>
              </td>
              <td className="tnum py-2 text-center">
                {slipQuantity(line.quantity)} {line.unitName}
              </td>
              <td className="tnum py-2 text-left font-medium">
                {formatMoney(line.lineTotal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {invoice.notes && (
        <p className="mt-4 border-t border-ink/30 pt-3 text-sm">
          <span className="text-muted">ملاحظات: </span>
          {invoice.notes}
        </p>
      )}
    </A4Document>
  );
}
