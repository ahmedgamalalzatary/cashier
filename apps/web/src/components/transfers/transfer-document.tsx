import type { ReactNode } from "react";
import type { TransferDetail } from "@cashier/shared";
import { itemLabel } from "@cashier/web-core/lib/format";
import { A4Document } from "@/components/print/a4-document";
import { slipQuantity } from "@/components/print/print-slip";

const cairoDateTime = new Intl.DateTimeFormat("ar-EG", {
  timeZone: "Africa/Cairo",
  dateStyle: "medium",
  timeStyle: "short",
});

/** The A4 transfer record both warehouses keep (spec §2). */
export function TransferDocument({ transfer }: { transfer: TransferDetail }) {
  return (
    <A4Document
      title="تحويل مخزني"
      label={`تحويل مخزني ${transfer.id}`}
      facts={[
        ["من", "المخزن الرئيسي"],
        ["إلى", "مخزن الكافيه"],
        [
          "المصدر",
          transfer.requestId
            ? `طلب تحويل #${transfer.requestId}`
            : "تحويل مباشر",
        ],
        ["صاحب الطلب", transfer.createdByName],
        ["اعتمد التحويل", transfer.approvedByName],
        ...(transfer.requestCreatedAt
          ? ([
              [
                "وقت الطلب",
                <span key="requested" className="tnum">
                  {cairoDateTime.format(new Date(transfer.requestCreatedAt))}
                </span>,
              ],
            ] as [string, ReactNode][])
          : []),
        ...(transfer.requestReviewedAt
          ? ([
              [
                "وقت الاعتماد",
                <span key="reviewed" className="tnum">
                  {cairoDateTime.format(new Date(transfer.requestReviewedAt))}
                </span>,
              ],
            ] as [string, ReactNode][])
          : []),
        [
          "وقت التنفيذ",
          <span key="time" className="tnum">
            {cairoDateTime.format(new Date(transfer.createdAt))}
          </span>,
        ],
        ["ملاحظات", transfer.notes],
        ...(transfer.isNegativeStock
          ? [["تنبيه", "رصيد سالب: كمية أكبر من المتاح في المخزن الرئيسي"] as [string, string]]
          : []),
      ]}
      signatures={["المُسلِّم", "المُستلِم"]}
    >
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-y-2 border-ink/40 text-muted">
            <th className="py-2 text-right font-medium">الصنف</th>
            <th className="py-2 text-center font-medium">الكمية</th>
            <th className="py-2 text-left font-medium">الوحدة</th>
          </tr>
        </thead>
        <tbody>
          {transfer.lines.map((line) => (
            <tr key={line.id} className="align-top">
              <td className="py-2 pe-2 font-medium">
                {itemLabel(line.itemCode, line.itemName)}
              </td>
              <td className="tnum py-2 text-center">
                {slipQuantity(line.quantity)}
              </td>
              <td className="py-2 text-left">{line.stockUnit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </A4Document>
  );
}
