"use client";

import { useState } from "react";
import { flushSync } from "react-dom";
import { Printer } from "lucide-react";
import type { OrderDetail } from "@cashier/shared";
import { IconButton } from "@cashier/web-core/components/ui/icon-button";
import { PrintSlip } from "@/components/print/print-slip";
import { OrderReceipt } from "@/components/pos/order-receipt";
import { getOrder } from "@/services/orders-service";

/**
 * Per-row printing for the orders list: it fetches the full order (the list
 * holds summaries only), slips it onto the page and opens the print dialog.
 * Loading errors surface through the page banner.
 */
export function OrderPrintButton({
  orderId,
  orderNumber,
  onFail,
}: {
  orderId: string;
  /** From the list row, for the accessible label before the detail loads. */
  orderNumber: string;
  /** Receives the message for the page's error banner. */
  onFail: (message: string) => void;
}) {
  const [printing, setPrinting] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const print = () => {
    setLoading(true);
    void getOrder(orderId)
      .then((order) => {
        // The slip must be on the page before the print dialog reads it.
        flushSync(() => setPrinting(order));
        window.print();
      })
      .catch((cause: unknown) =>
        onFail(cause instanceof Error ? cause.message : "تعذر تحميل الطلب"),
      )
      .finally(() => setLoading(false));
  };

  return (
    <>
      {printing && (
        <PrintSlip>
          <OrderReceipt order={printing} />
        </PrintSlip>
      )}
      <IconButton
        title={`طباعة الطلب ${orderNumber}`}
        onClick={print}
        disabled={loading}
      >
        <Printer className="size-4" />
      </IconButton>
    </>
  );
}
