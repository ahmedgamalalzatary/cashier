"use client";

import { useEffect, useState } from "react";
import type { OrderDetail, WasteDetail } from "@cashier/shared";
import { Modal } from "@cashier/web-core/components/ui/modal";
import { ErrorBanner, LoadingState } from "@cashier/web-core/components/ui/states";
import { getOrder } from "@/services/orders-service";
import { WasteEntryForm } from "@/components/waste/waste-entry-form";
import { orderWasteTargetKeys } from "@/models/orders-model";

/**
 * Waste from an order's products: the cafe holds what the sale consumed, so
 * the form is preset there and limited to the lines of this order. A refund
 * marked "غير قابل للإرجاع" is already recorded as waste by the refund flow,
 * so logging more is for the physical leftovers only.
 */
export function OrderWasteModal({
  orderId,
  title,
  onClose,
  onSaved,
}: {
  orderId: string | null;
  title: string;
  onClose: () => void;
  onSaved: (entry: WasteDetail) => void;
}) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    getOrder(orderId)
      .then((detail) => {
        if (!cancelled) setOrder(detail);
      })
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message || "تعذر تحميل الطلب");
      });
    return () => {
      cancelled = true;
      setOrder(null);
      setError("");
    };
  }, [orderId]);

  if (!orderId) return null;
  return (
    <Modal title={title} open onClose={onClose}>
      <p className="mb-3 text-xs text-muted">
        الهالك لا يغيّر البيع؛ الكمية تُخصم من مخزن الكافيه فقط. المرتجع
        المُسجل بتسجيل «غير قابل للإرجاع» يُسجَّل تلقائياً كـهالك.
      </p>
      {error ? (
        <ErrorBanner>{error}</ErrorBanner>
      ) : !order ? (
        <LoadingState label="جارِ تحميل أصناف الطلب…" />
      ) : (
        <WasteEntryForm
          presetWarehouse="cafe"
          allowedTargetKeys={orderWasteTargetKeys(order)}
          onSaved={onSaved}
        />
      )}
    </Modal>
  );
}
