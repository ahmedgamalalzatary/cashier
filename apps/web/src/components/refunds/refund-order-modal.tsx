"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import type {
  OrderDetail,
  RefundDetail,
  RefundStockAction,
} from "@cashier/shared";
import { Button } from "@cashier/web-core/components/ui/button";
import { Modal } from "@cashier/web-core/components/ui/modal";
import { ErrorBanner, LoadingState } from "@cashier/web-core/components/ui/states";
import {
  refundDraftEntry,
  type RefundDraftLine,
} from "@/models/refunds-model";
import { getOrder } from "@/services/orders-service";
import {
  createRefund,
  getRefundedQuantities,
} from "@/services/refunds-service";

/**
 * The refund form for one order, shared by the refunds page, the order page
 * and POS. Errors render inside the dialog (T5).
 */
export function RefundOrderModal({
  orderId,
  onClose,
  onSaved,
}: {
  orderId: number;
  onClose: () => void;
  onSaved: (refund: RefundDetail) => void;
}) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [draft, setDraft] = useState<Record<number, RefundDraftLine>>({});
  const [reason, setReason] = useState("");
  const [clientRequestId, setClientRequestId] = useState(() =>
    crypto.randomUUID(),
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getOrder(orderId), getRefundedQuantities(orderId)])
      .then(([selected, quantities]) => {
        if (cancelled) return;
        const refunded = new Map(
          quantities.map((row) => [row.orderLineId, Number(row.refundedQuantity)]),
        );
        setOrder(selected);
        setDraft(
          Object.fromEntries(
            selected.lines.map((line) => [
              line.id,
              {
                quantity: 0,
                stockAction:
                  line.type === "item" || line.type === "external_product"
                    ? "return_to_stock"
                    : null,
                refundedQuantity: refunded.get(line.id) ?? 0,
              },
            ]),
          ),
        );
        setReason("");
        setClientRequestId(crypto.randomUUID());
      })
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message || "تعذر تحميل الطلب");
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  async function submit() {
    if (!order) return;
    const lines = order.lines.flatMap((line) => {
      const entry = refundDraftEntry(draft, line.id);
      return entry.quantity > 0
        ? [
            {
              orderLineId: line.id,
              quantity: entry.quantity,
              stockAction: entry.stockAction,
            },
          ]
        : [];
    });
    setSaving(true);
    setError("");
    try {
      const created = await createRefund({
        clientRequestId,
        orderId: order.id,
        reason,
        lines,
      });
      onSaved(created);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "تعذر تسجيل المرتجع",
      );
    } finally {
      setSaving(false);
    }
  }

  if (error && !order) {
    return (
      <Modal title="مرتجع" open onClose={onClose}>
        <ErrorBanner>{error}</ErrorBanner>
      </Modal>
    );
  }
  if (!order) {
    return (
      <Modal title="جارِ تحميل المرتجع" open onClose={onClose}>
        <LoadingState label="جارِ تحميل الطلب…" />
      </Modal>
    );
  }

  const selectedCount = Object.values(draft).filter(
    (line) => line.quantity > 0,
  ).length;

  return (
    <Modal title={`مرتجع الطلب ${order.orderNumber}`} open onClose={onClose}>
      <div className="space-y-4">
        {order.lines.map((line) => {
          const current = refundDraftEntry(draft, line.id);
          const available = Math.max(
            0,
            Number(line.quantity) - current.refundedQuantity,
          );
          return (
            <div key={line.id} className="sheet p-3">
              <div className="flex justify-between gap-3">
                <div>
                  <strong>{line.productName}</strong>
                  <p className="text-xs text-muted">
                    {line.sizeName ?? "صنف مباشر"}
                  </p>
                </div>
                <span className="text-xs text-muted">
                  متاح: <b className="tnum">{available}</b>
                </span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <input
                  aria-label={`كمية مرتجع ${line.productName}`}
                  type="number"
                  min="0"
                  max={available}
                  step={line.type === "item" ? 0.001 : 1}
                  value={current.quantity || ""}
                  onChange={(event) => {
                    setClientRequestId(crypto.randomUUID());
                    setDraft((state) => ({
                      ...state,
                      [line.id]: {
                        ...refundDraftEntry(state, line.id),
                        quantity: Number(event.target.value),
                      },
                    }));
                  }}
                  className="input tnum"
                />
                {(line.type === "item" || line.type === "external_product") && (
                  <select
                    aria-label={`معالجة مخزون ${line.productName}`}
                    value={current.stockAction ?? "return_to_stock"}
                    onChange={(event) => {
                      setClientRequestId(crypto.randomUUID());
                      setDraft((state) => ({
                        ...state,
                        [line.id]: {
                          ...refundDraftEntry(state, line.id),
                          stockAction: event.target
                            .value as RefundStockAction,
                        },
                      }));
                    }}
                    className="input"
                  >
                    <option value="return_to_stock">إعادة للمخزون</option>
                    <option value="not_returnable">غير صالح للإعادة</option>
                  </select>
                )}
              </div>
            </div>
          );
        })}
        <textarea
          aria-label="سبب المرتجع"
          value={reason}
          onChange={(event) => {
            setClientRequestId(crypto.randomUUID());
            setReason(event.target.value);
          }}
          placeholder="سبب المرتجع"
          maxLength={500}
          className="input min-h-24"
        />
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <Button
          onClick={() => void submit()}
          disabled={saving || selectedCount === 0 || reason.trim().length < 2}
          className="w-full justify-center"
        >
          <RotateCcw className="size-4" />{" "}
          {saving ? "جارِ التسجيل…" : "تأكيد رد النقد"}
        </Button>
      </div>
    </Modal>
  );
}
