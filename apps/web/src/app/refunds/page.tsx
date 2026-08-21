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
import { Modal } from "@/components/ui/modal";
import { Table } from "@/components/ui/table";
import { useAuth } from "@/components/auth/auth-provider";
import { formatMoney } from "@/lib/format";
import { getOrder, listOrders } from "@/services/orders-service";
import {
  createRefund,
  getRefund,
  getRefundedQuantities,
  listRefunds,
} from "@/services/refunds-service";

type DraftLine = {
  quantity: number;
  stockAction: RefundStockAction | null;
  refundedQuantity: number;
};

export default function RefundsPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [refunds, setRefunds] = useState<RefundSummary[]>([]);
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [draft, setDraft] = useState<Record<number, DraftLine>>({});
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
              stockAction: line.type === "item" ? "return_to_stock" : null,
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
    const lines = order.lines
      .filter((line) => (draft[line.id]?.quantity ?? 0) > 0)
      .map((line) => ({
        orderLineId: line.id,
        quantity: draft[line.id].quantity,
        stockAction: draft[line.id].stockAction,
      }));
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

  return (
    <div className="space-y-6">
      <div>
        <PageHeader title="المرتجعات" />
        <p className="-mt-4 text-sm text-muted">
          استرجاع كلي أو جزئي من الطلب الأصلي مع تسجيل أثر النقد والمخزون.
        </p>
      </div>
      {error && (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
          {error}
        </p>
      )}

      {user?.role === "cashier" && <section className="rounded-2xl border border-line bg-surface p-4">
        <label className="relative block">
          <Search className="pointer-events-none absolute inset-y-0 right-3 my-auto size-5 text-muted" />
          <input
            aria-label="البحث عن طلب"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="رقم الطلب أو اسم الكاشير"
            className="h-11 w-full rounded-xl border border-line bg-paper pe-11 ps-3 outline-none focus:border-primary"
          />
        </label>
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {visibleOrders.map((row) => (
            <button
              type="button"
              key={row.id}
              onClick={() => chooseOrder(row.id)}
              className="flex items-center justify-between rounded-xl border border-line p-3 text-right hover:border-primary"
            >
              <span>
                <strong className="block tnum" dir="ltr">{row.orderNumber}</strong>
                <small className="text-muted">{row.cashierName}</small>
              </span>
              <span className="font-bold tnum">{formatMoney(row.total)}</span>
            </button>
          ))}
        </div>
      </section>}

      <section className="rounded-2xl border border-line bg-surface">
        <h2 className="border-b border-line p-4 font-bold">سجل المرتجعات</h2>
        <Table headers={["الطلب", "الكاشير", "السبب", "القيمة", "التاريخ"]}>
            {refunds.map((row) => (
              <tr key={row.id}>
                <td>
                  <button
                    type="button"
                    aria-label={`عرض مرتجع الطلب ${row.orderNumber}`}
                    onClick={() =>
                      getRefund(row.id)
                        .then(setDetail)
                        .catch((cause: Error) => setError(cause.message))
                    }
                    className="font-medium tnum hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    dir="ltr"
                  >
                    {row.orderNumber}
                  </button>
                </td>
                <td>{row.cashierName}</td>
                <td>{row.reason}</td>
                <td className="tnum">{formatMoney(row.amount)}</td>
                <td>{new Date(row.createdAt).toLocaleString("ar-EG")}</td>
              </tr>
            ))}
        </Table>
      </section>

      {order && (
        <Modal title={`مرتجع الطلب ${order.orderNumber}`} open onClose={() => setOrder(null)}>
          <div className="space-y-4">
            {order.lines.map((line) => {
              const current = draft[line.id];
              const available = Math.max(0, Number(line.quantity) - current.refundedQuantity);
              return (
                <div key={line.id} className="rounded-xl border border-line p-3">
                  <div className="flex justify-between gap-3">
                    <div><strong>{line.productName}</strong><p className="text-xs text-muted">{line.sizeName ?? "صنف مباشر"}</p></div>
                    <span className="text-xs text-muted">متاح: <b className="tnum">{available}</b></span>
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
                          [line.id]: { ...state[line.id], quantity: Number(event.target.value) },
                        }));
                      }}
                      className="h-10 rounded-lg border border-line px-3 tnum"
                    />
                    {line.type === "item" && (
                      <select
                        aria-label={`معالجة مخزون ${line.productName}`}
                        value={current.stockAction ?? "return_to_stock"}
                        onChange={(event) => {
                          setClientRequestId(crypto.randomUUID());
                          setDraft((state) => ({
                            ...state,
                            [line.id]: { ...state[line.id], stockAction: event.target.value as RefundStockAction },
                          }));
                        }}
                        className="h-10 rounded-lg border border-line px-3"
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
              className="min-h-24 w-full rounded-xl border border-line p-3"
            />
            <Button onClick={submit} disabled={saving || selectedCount === 0 || reason.trim().length < 2} className="w-full justify-center">
              <RotateCcw className="size-4" /> {saving ? "جارِ التسجيل…" : "تأكيد رد النقد"}
            </Button>
          </div>
        </Modal>
      )}

      {detail && (
        <Modal title={`مرتجع ${detail.orderNumber}`} open onClose={() => setDetail(null)}>
          <dl className="mb-4 grid grid-cols-2 gap-3 rounded-xl bg-paper p-4">
            <div><dt className="text-xs text-muted">القيمة المستردة</dt><dd className="font-bold tnum">{formatMoney(detail.amount)}</dd></div>
            <div><dt className="text-xs text-muted">الكاشير</dt><dd>{detail.cashierName}</dd></div>
            <div className="col-span-2"><dt className="text-xs text-muted">السبب</dt><dd>{detail.reason}</dd></div>
          </dl>
          <div className="space-y-2">
            {detail.lines.map((line) => (
              <div key={line.id} className="flex justify-between rounded-lg border border-line p-3">
                <span>{line.productName} {line.sizeName ? `- ${line.sizeName}` : ""} × <b className="tnum">{line.quantity}</b></span>
                <b className="tnum">{formatMoney(line.refundAmount)}</b>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
