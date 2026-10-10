import type { ExternalOrderSummary } from "@cashier/shared";
import { formatMoney } from "@cashier/web-core/lib/format";
import { Slip, SlipFacts, SlipTotals } from "@/components/print/print-slip";
import {
  externalOrderDate,
  externalOrderStatus,
  externalOrderTypeLabel,
  externalPaymentMethodLabel,
  externalPaymentStatus,
} from "../../models/external-orders-model";

const dateTime = new Intl.DateTimeFormat("ar-EG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

/** Online orders are cached without item names, so only their count prints. */
export function ExternalOrderSlip({ order }: { order: ExternalOrderSummary }) {
  return (
    <Slip title="طلب أونلاين" label={`طلب أونلاين ${order.id}`}>
      <SlipFacts
        facts={[
          [
            "رقم الطلب",
            <b key="id" className="tnum" dir="ltr">
              #{order.id}
            </b>,
          ],
          ["التاريخ", dateTime.format(externalOrderDate(order.createdAt))],
          ["العميل", order.customerName],
          [
            "الهاتف",
            order.customerPhone && (
              <span key="phone" className="tnum" dir="ltr">
                {order.customerPhone}
              </span>
            ),
          ],
          ["نوع الطلب", externalOrderTypeLabel(order.orderType)],
          [
            "الدفع",
            `${externalPaymentStatus(order.paymentStatus).label} · ${externalPaymentMethodLabel(order.paymentMethod)}`,
          ],
          ["الحالة", externalOrderStatus(order.orderStatus).label],
          [
            "عدد الأصناف",
            <span key="count" className="tnum">
              {order.itemCount.toLocaleString("ar-EG")}
            </span>,
          ],
        ]}
      />
      <SlipTotals
        totals={[
          ["الإجمالي قبل الخصم", formatMoney(order.subtotal)],
          Number(order.discountAmount) > 0 && [
            "الخصم",
            formatMoney(`-${order.discountAmount}`),
          ],
          Number(order.deliveryFee) > 0 && [
            "رسوم التوصيل",
            formatMoney(order.deliveryFee),
          ],
          ["الإجمالي", formatMoney(order.totalAmount), true],
        ]}
      />
    </Slip>
  );
}
