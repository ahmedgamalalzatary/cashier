import type { OrderDetail } from "@cashier/shared";
import { formatMoney } from "../../lib/format";

const dateTime = new Intl.DateTimeFormat("ar-EG", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function OrderReceipt({ order }: { order: OrderDetail }) {
  return (
    <article
      id="pos-receipt"
      className="receipt-print-root mx-auto w-full max-w-[80mm] bg-white px-5 py-6 text-ink"
      aria-label={`إيصال الطلب ${order.orderNumber}`}
    >
      <header className="border-b-2 border-dotted border-ink/30 pb-4 text-center">
        <p className="text-2xl font-bold">الكافيه</p>
        <p className="mt-1 text-xs">إيصال بيع نقدي · تيك أواي</p>
      </header>

      <dl className="my-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted">رقم الطلب</dt>
        <dd className="text-left font-bold tnum" dir="ltr">
          {order.orderNumber}
        </dd>
        <dt className="text-muted">التاريخ</dt>
        <dd className="text-left">
          {dateTime.format(new Date(order.createdAt))}
        </dd>
        <dt className="text-muted">الكاشير</dt>
        <dd className="text-left">{order.cashierName}</dd>
      </dl>

      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-y border-dotted border-ink/30 text-muted">
            <th className="py-2 text-right font-medium">الصنف</th>
            <th className="py-2 text-center font-medium">الكمية</th>
            <th className="py-2 text-left font-medium">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {order.lines.map((line) => (
            <tr key={line.id} className="align-top">
              <td className="py-2 pe-2">
                <span className="font-medium">{line.productName}</span>
                <span className="block text-[10px] text-muted">
                  {line.sizeName ? `${line.sizeName} · ` : ""}
                  {formatMoney(line.unitPrice)}
                </span>
              </td>
              <td className="py-2 text-center tnum" dir="ltr">
                {Number(line.quantity).toLocaleString("ar-EG", {
                  maximumFractionDigits: 3,
                })}
              </td>
              <td className="py-2 text-left font-medium tnum">
                {formatMoney(line.lineSubtotal)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="mt-3 space-y-1 border-t-2 border-dotted border-ink/30 pt-3 text-sm">
        <ReceiptTotal label="الإجمالي قبل الخصم" value={order.subtotal} />
        {Number(order.discountAmount) > 0 && (
          <ReceiptTotal label="الخصم" value={`-${order.discountAmount}`} />
        )}
        <ReceiptTotal label="المطلوب" value={order.total} strong />
        <ReceiptTotal label="المستلم" value={order.cashReceived} />
        <ReceiptTotal label="الباقي" value={order.changeAmount} strong />
      </dl>

      <footer className="mt-5 border-t border-dotted border-ink/30 pt-4 text-center text-xs">
        <p className="font-medium">شكراً لزيارتكم</p>
        <p className="mt-1 text-[10px] text-muted">نتمنى لكم يوماً سعيداً</p>
      </footer>
    </article>
  );
}

function ReceiptTotal({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 ${
        strong ? "text-base font-bold" : ""
      }`}
    >
      <dt>{label}</dt>
      <dd className="tnum">{formatMoney(value)}</dd>
    </div>
  );
}
