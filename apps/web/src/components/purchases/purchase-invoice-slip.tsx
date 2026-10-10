import type { PurchaseInvoiceDetail } from "@cashier/shared";
import { formatMoney, itemLabel } from "@cashier/web-core/lib/format";
import {
  Slip,
  SlipFacts,
  SlipNote,
  SlipTotals,
  slipQuantity,
} from "@/components/print/print-slip";

export function PurchaseInvoiceSlip({
  invoice,
}: {
  invoice: PurchaseInvoiceDetail;
}) {
  const number = invoice.invoiceNumber || `#${invoice.id}`;
  return (
    <Slip title="فاتورة شراء" label={`فاتورة شراء ${number}`}>
      <SlipFacts
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
      />
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-y border-dotted border-ink/30 text-muted">
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
                <span className="block text-[10px] text-muted">
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
      <SlipTotals
        totals={[
          ["الإجمالي", formatMoney(invoice.totalAmount), true],
          ["المدفوع عند الشراء", formatMoney(invoice.paidAmount)],
          ["الآجل عند التسجيل", formatMoney(invoice.dueAmount), true],
        ]}
      />
      {invoice.notes && <SlipNote label="ملاحظات" text={invoice.notes} />}
    </Slip>
  );
}
