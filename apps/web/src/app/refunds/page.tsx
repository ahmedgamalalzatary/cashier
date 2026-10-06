"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  OrderDetail,
  OrderSummary,
  RefundDetail,
  RefundStockAction,
  RefundSummary,
} from "@cashier/shared";
import { RotateCcw, Search } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { Modal } from "@/components/ui/modal";
import { Section } from "@/components/ui/section";
import { EmptyState, ErrorBanner } from "@/components/ui/states";
import { useAuth } from "@/components/auth/auth-provider";
import { formatMoney } from "@/lib/format";
import {
  refundDraftEntry,
  type RefundDraftLine,
} from "@/models/refunds-model";
import { getOrder, listOrders } from "@/services/orders-service";
import {
  createRefund,
  getRefund,
  getRefundedQuantities,
  listRefunds,
} from "@/services/refunds-service";

export default function RefundsPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [refunds, setRefunds] = useState<RefundSummary[]>([]);
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [draft, setDraft] = useState<Record<number, RefundDraftLine>>({});
  const [reason, setReason] = useState("");
  const [clientRequestId, setClientRequestId] = useState(() =>
    crypto.randomUUID(),
  );
  const [detail, setDetail] = useState<RefundDetail | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

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

  const visibleOrders = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized
      ? orders.filter(
          (row) =>
            row.orderNumber.toLowerCase().includes(normalized) ||
            row.cashierName.toLowerCase().includes(normalized),
        )
      : orders;
  }, [orders, query]);

  const chooseOrder = async (id: number) => {
    setError("");
    try {
      const [selected, quantities] = await Promise.all([
        getOrder(id),
        getRefundedQuantities(id),
      ]);
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل الطلب");
    }
  };

  const submit = async () => {
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
      let created: RefundDetail;
      try {
        created = await createRefund({
          clientRequestId,
          orderId: order.id,
          reason,
          lines,
        });
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "تعذر تسجيل المرتجع",
        );
        return;
      }
      setOrder(null);
      setDetail(created);
      try {
        await load();
      } catch {
        setError("تم تسجيل المرتجع، لكن تعذر تحديث البيانات");
      }
    } finally {
      setSaving(false);
    }
  };

  const selectedCount = Object.values(draft).filter(
    (line) => line.quantity > 0,
  ).length;

  const orderColumns: DataColumn<OrderSummary>[] = [
    {
      key: "orderNumber",
      header: "رقم الطلب",
      mobile: "primary",
      cell: (row) => (
        <span className="tnum font-medium" dir="ltr">
          {row.orderNumber}
        </span>
      ),
    },
    { key: "cashier", header: "الكاشير", cell: (row) => row.cashierName },
    {
      key: "total",
      header: "الإجمالي",
      numeric: true,
      cell: (row) => (
        <span className="font-bold">{formatMoney(row.total)}</span>
      ),
    },
  ];

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

      {user?.role !== "cashier" && (
        <p className="sheet p-4 text-sm text-muted">
          تسجيل المرتجعات متاح لحساب الكاشير فقط — يعرض هذا الحساب سجل
          المرتجعات أدناه.
        </p>
      )}

      {user?.role === "cashier" && (
        <Section title="اختر الطلب">
          <label className="relative mb-4 block">
            <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-5 text-muted" />
            <input
              aria-label="البحث عن طلب"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="رقم الطلب أو اسم الكاشير"
              className="input ps-11"
            />
          </label>
          <DataTable
            caption="اختيار طلب للارتجاع"
            rows={visibleOrders}
            rowKey={(row) => row.id}
            columns={orderColumns}
            empty={
              <EmptyState
                icon={<RotateCcw className="size-8" />}
                title="لا توجد طلبات"
                description="لا توجد طلبات مطابقة للبحث."
              />
            }
            actions={(row) => (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void chooseOrder(row.id)}
              >
                اختيار
              </Button>
            )}
          />
        </Section>
      )}

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

      {order && (
        <Modal
          title={`مرتجع الطلب ${order.orderNumber}`}
          open
          onClose={() => setOrder(null)}
        >
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
                    {(line.type === "item" ||
                      line.type === "external_product") && (
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
                        <option value="not_returnable">
                          غير صالح للإعادة
                        </option>
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
            <Button
              onClick={submit}
              disabled={
                saving || selectedCount === 0 || reason.trim().length < 2
              }
              className="w-full justify-center"
            >
              <RotateCcw className="size-4" />{" "}
              {saving ? "جارِ التسجيل…" : "تأكيد رد النقد"}
            </Button>
          </div>
        </Modal>
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
