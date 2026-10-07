"use client";

import { useEffect, useState } from "react";
import type {
  OrderSummary,
  RefundDetail,
  RefundSummary,
} from "@cashier/shared";
import { RotateCcw } from "lucide-react";
import { PageHeader } from "@cashier/web-core/components/ui/page-header";
import { DataTable, type DataColumn } from "@cashier/web-core/components/ui/data-table";
import { Modal } from "@cashier/web-core/components/ui/modal";
import { Section } from "@cashier/web-core/components/ui/section";
import { EmptyState, ErrorBanner } from "@cashier/web-core/components/ui/states";
import { OrderPicker } from "@/components/refunds/order-picker";
import { RefundOrderModal } from "@/components/refunds/refund-order-modal";
import { formatMoney } from "@cashier/web-core/lib/format";
import { listOrders } from "@/services/orders-service";
import { getRefund, listRefunds } from "@/services/refunds-service";

export default function RefundsPage() {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [refunds, setRefunds] = useState<RefundSummary[]>([]);
  const [refundingOrderId, setRefundingOrderId] = useState<number | null>(null);
  const [detail, setDetail] = useState<RefundDetail | null>(null);
  const [error, setError] = useState("");

  const load = async (cancelled: () => boolean = () => false) => {
    const [nextOrders, nextRefunds] = await Promise.all([
      listOrders(),
      listRefunds(),
    ]);
    if (cancelled()) return;
    setOrders(nextOrders);
    setRefunds(nextRefunds);
  };

  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => load(() => cancelled))
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refundColumns: DataColumn<RefundSummary>[] = [
    {
      key: "orderNumber",
      header: "الطلب",
      mobile: "primary",
      cell: (row) => (
        <button
          type="button"
          aria-label={`عرض مرتجع الطلب ${row.orderNumber}`}
          onClick={() =>
            getRefund(row.id)
              .then(setDetail)
              .catch((cause: Error) => setError(cause.message))
          }
          className="tnum font-medium transition-colors hover:text-primary"
          dir="ltr"
        >
          {row.orderNumber}
        </button>
      ),
    },
    { key: "cashier", header: "الكاشير", cell: (row) => row.cashierName },
    { key: "reason", header: "السبب", cell: (row) => row.reason },
    {
      key: "amount",
      header: "القيمة",
      numeric: true,
      cell: (row) => formatMoney(row.amount),
    },
    {
      key: "at",
      header: "التاريخ",
      cell: (row) => (
        <span className="text-muted">
          {new Date(row.createdAt).toLocaleString("ar-EG")}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="المرتجعات"
        description="استرجاع كلي أو جزئي من الطلب الأصلي مع تسجيل أثر النقد والمخزون."
      />
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <Section title="اختر الطلب">
        <OrderPicker orders={orders} onPick={setRefundingOrderId} />
      </Section>

      <section className="space-y-3">
        <h2 className="font-bold">سجل المرتجعات</h2>
        <DataTable
          caption="سجل المرتجعات"
          rows={refunds}
          rowKey={(row) => row.id}
          columns={refundColumns}
          empty={
            <EmptyState
              icon={<RotateCcw className="size-8" />}
              title="لا توجد مرتجعات بعد"
            />
          }
        />
      </section>

      {refundingOrderId !== null && (
        <RefundOrderModal
          orderId={refundingOrderId}
          onClose={() => setRefundingOrderId(null)}
          onSaved={(refund) => {
            setRefundingOrderId(null);
            setDetail(refund);
            void load().catch(() =>
              setError("تم تسجيل المرتجع، لكن تعذر تحديث البيانات"),
            );
          }}
        />
      )}

      {detail && (
        <Modal
          title={`مرتجع ${detail.orderNumber}`}
          open
          onClose={() => setDetail(null)}
        >
          <dl className="mb-4 grid grid-cols-2 gap-3 rounded-xl bg-paper p-4">
            <div>
              <dt className="text-xs text-muted">القيمة المستردة</dt>
              <dd className="tnum font-bold">{formatMoney(detail.amount)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">الكاشير</dt>
              <dd>{detail.cashierName}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-muted">السبب</dt>
              <dd>{detail.reason}</dd>
            </div>
          </dl>
          <div className="space-y-2">
            {detail.lines.map((line) => (
              <div
                key={line.id}
                className="flex justify-between rounded-lg border border-line p-3"
              >
                <span>
                  {line.productName} {line.sizeName ? `- ${line.sizeName}` : ""}{" "}
                  × <b className="tnum">{line.quantity}</b>
                </span>
                <b className="tnum">{formatMoney(line.refundAmount)}</b>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
