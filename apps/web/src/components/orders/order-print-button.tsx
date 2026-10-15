"use client";

import { useState } from "react";
import { Printer } from "lucide-react";
import type { OrderDetail } from "@cashier/shared";
import { IconButton } from "@cashier/web-core/components/ui/icon-button";
import { getOrder } from "@/services/orders-service";

/**
 * Per-row printing for the orders list: it fetches the full order (the list
 * holds summaries only) and hands it to the page, which owns the single
 * active receipt slip. Loading errors surface through the page banner.
 */
export function OrderPrintButton({
  orderId,
  orderNumber,
  onFail,
  onOrder,
}: {
  orderId: string;
  /** From the list row, for the accessible label before the detail loads. */
  orderNumber: string;
  /** Receives the message for the page's error banner. */
  onFail: (message: string) => void;
  /** The list keeps one receipt at a time and clears it after printing. */
  onOrder: (order: OrderDetail) => void;
}) {
  const [loading, setLoading] = useState(false);

  return (
    <IconButton
      title={`طباعة الطلب ${orderNumber}`}
      disabled={loading}
      onClick={() => {
        setLoading(true);
        void getOrder(orderId)
          .then(onOrder)
          .catch((cause: unknown) =>
            onFail(cause instanceof Error ? cause.message : "تعذر تحميل الطلب"),
          )
          .finally(() => setLoading(false));
      }}
    >
      <Printer className="size-4" />
    </IconButton>
  );
}
