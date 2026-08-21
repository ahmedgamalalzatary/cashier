"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { ExternalOrderSummary } from "@cashier/shared";
import { Clock3, Coins, ReceiptText, Scissors, Search } from "lucide-react";
import { Badge } from "../ui/badge";
import { Table } from "../ui/table";
import { cairoCalendarDate } from "../../lib/cairo-date";
import { formatMoney } from "../../lib/format";
import {
  externalOrderStatus,
  externalOrderTypeLabel,
  externalOrdersTotals,
  externalPaymentMethodLabel,
  externalPaymentStatus,
  filterExternalOrders,
} from "../../models/external-orders-model";
import { listExternalOrders } from "../../services/orders-service";

const dayFormat = new Intl.DateTimeFormat("ar-EG", {
  dateStyle: "medium",
  timeZone: "UTC",
});
const timeFormat = new Intl.DateTimeFormat("ar-EG", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
});

const wallClockDate = (value: string) =>
  new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`);

export function ExternalOrdersPanel() {
  const [orders, setOrders] = useState<ExternalOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [day, setDay] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    listExternalOrders()
      .then((result) => {
        if (cancelled) return;
        setOrders(result.data);
        setError("");
      })
      .catch((caught) => {
        if (cancelled) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "تعذر تحميل طلبات الأونلاين",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ExternalOrdersPanelView
      orders={orders}
      loading={loading}
      error={error}
      query={query}
      day={day}
      onQueryChange={setQuery}
      onDayChange={setDay}
    />
  );
}

export function ExternalOrdersPanelView({
  orders,
  loading,
  error,
  query,
  day,
  onQueryChange,
  onDayChange,
}: {
  orders: ExternalOrderSummary[];
  loading: boolean;
  error: string;
  query: string;
  day: string;
  onQueryChange: (query: string) => void;
  onDayChange: (day: string) => void;
}) {
  const visibleRows = filterExternalOrders(orders, { query, day });
  const totals = externalOrdersTotals(visibleRows);

  return (
    <>
      <section className="mb-6 overflow-hidden rounded-2xl border border-line bg-sidebar text-white shadow-[0_16px_45px_rgb(43_33_24/0.10)]">
        <div className="grid grid-cols-2 divide-x divide-y divide-white/10 divide-x-reverse lg:grid-cols-4 lg:divide-y-0">
          <Summary
            icon={<ReceiptText className="size-5 text-accent" />}
            label="عدد الطلبات المعروضة"
            value={totals.countLabel}
          />
          <Summary
            icon={<Coins className="size-5 text-accent" />}
            label="إجمالي قيمة الطلبات"
            value={totals.sales}
          />
          <Summary
            icon={<Scissors className="size-5 text-accent" />}
            label="إجمالي الخصومات"
            value={totals.discounts}
          />
          <Summary
            icon={<Clock3 className="size-5 text-accent" />}
            label="طلبات قيد التنفيذ"
            value={totals.pending.toLocaleString("ar-EG")}
          />
        </div>
      </section>

      {error && (
        <p
          role="alert"
          className="mb-4 rounded-lg bg-danger/10 p-3 text-sm text-danger"
        >
          {error}
        </p>
      )}

      <div className="mb-4 grid gap-3 rounded-xl border border-line bg-surface p-3 md:grid-cols-[minmax(14rem,1fr)_12rem]">
        <label className="relative block">
          <Search className="pointer-events-none absolute right-3 top-2.5 size-4 text-muted" />
          <input
            aria-label="البحث عن طلب أونلاين"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="ابحث برقم الطلب أو اسم العميل أو رقم الهاتف"
            className="w-full rounded-lg border border-line bg-paper/40 py-2 pe-3 ps-9 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>
        <div className="flex gap-2">
          <input
            aria-label="تصفية طلبات الأونلاين حسب اليوم"
            type="date"
            value={day}
            onChange={(event) => onDayChange(event.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={() => onDayChange(day ? "" : cairoCalendarDate())}
            className="shrink-0 rounded-lg border border-line px-3 py-2 text-sm text-muted hover:border-primary hover:text-primary"
          >
            {day ? "كل الأيام" : "اليوم"}
          </button>
        </div>
      </div>

      {error ? null : loading ? (
        <p className="text-muted">جارِ تحميل طلبات الأونلاين…</p>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface p-10 text-center">
          <ReceiptText className="mx-auto mb-3 size-8 text-muted" />
          <p className="font-medium">لا توجد طلبات أونلاين بعد</p>
        </div>
      ) : visibleRows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-muted">
          لا توجد طلبات تطابق عوامل التصفية الحالية.
        </p>
      ) : (
        <>
          <ul className="grid gap-3 md:hidden">
            {visibleRows.map((row) => {
              const createdAt = wallClockDate(row.createdAt);
              const status = externalOrderStatus(row.orderStatus);
              const payment = externalPaymentStatus(row.paymentStatus);
              return (
                <li
                  key={row.id}
                  className="rounded-xl border border-line bg-surface p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="tnum block font-bold">#{row.id}</span>
                      <span className="block truncate text-sm font-medium">
                        {row.customerName}
                      </span>
                      {row.customerPhone && (
                        <span
                          className="block text-xs tnum text-muted"
                          dir="ltr"
                        >
                          {row.customerPhone}
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge tone={status.tone}>{status.label}</Badge>
                      <span className="tnum text-base font-bold">
                        {formatMoney(row.totalAmount)}
                      </span>
                    </div>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3 text-xs">
                    <div>
                      <dt className="text-muted">الوقت</dt>
                      <dd className="tnum">
                        {timeFormat.format(createdAt)} ·{" "}
                        {dayFormat.format(createdAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">نوع الطلب</dt>
                      <dd>
                        {externalOrderTypeLabel(row.orderType)} ·{" "}
                        {row.itemCount.toLocaleString("ar-EG")} صنف
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">الدفع</dt>
                      <dd className="flex flex-wrap items-center gap-1">
                        <Badge tone={payment.tone}>{payment.label}</Badge>
                        <span className="text-muted">
                          {externalPaymentMethodLabel(row.paymentMethod)}
                        </span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">الخصم</dt>
                      <dd className="tnum">
                        {Number(row.discountAmount) > 0
                          ? formatMoney(row.discountAmount)
                          : "—"}
                      </dd>
                    </div>
                  </dl>
                </li>
              );
            })}
          </ul>
          <div className="hidden md:block">
            <Table
              headers={[
                "رقم الطلب",
                "الوقت",
                "العميل",
                "نوع الطلب",
                "الدفع",
                "الخصم",
                "الإجمالي",
                "الحالة",
              ]}
            >
              {visibleRows.map((row) => {
                const createdAt = wallClockDate(row.createdAt);
                const status = externalOrderStatus(row.orderStatus);
                const payment = externalPaymentStatus(row.paymentStatus);
                return (
                  <tr key={row.id} className="hover:bg-paper/50">
                    <td className="px-4 py-3 tnum font-bold">#{row.id}</td>
                    <td className="px-4 py-3">
                      <span className="block tnum">
                        {timeFormat.format(createdAt)}
                      </span>
                      <span className="block text-xs tnum text-muted">
                        {dayFormat.format(createdAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="block font-medium">
                        {row.customerName}
                      </span>
                      {row.customerPhone && (
                        <span
                          className="block text-xs tnum text-muted"
                          dir="ltr"
                        >
                          {row.customerPhone}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="block">
                        {externalOrderTypeLabel(row.orderType)}
                      </span>
                      <span className="block text-xs text-muted">
                        {row.itemCount.toLocaleString("ar-EG")} صنف
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={payment.tone}>{payment.label}</Badge>
                      <span className="mt-1 block text-xs text-muted">
                        {externalPaymentMethodLabel(row.paymentMethod)}
                      </span>
                    </td>
                    <td className="px-4 py-3 tnum text-muted">
                      {Number(row.discountAmount) > 0
                        ? formatMoney(row.discountAmount)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 tnum font-bold">
                      {formatMoney(row.totalAmount)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </Table>
          </div>
        </>
      )}
    </>
  );
}

function Summary({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-3 sm:gap-3 sm:px-5 sm:py-4">
      <div className="shrink-0 rounded-lg bg-white/8 p-2">{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] text-sidebar-ink sm:text-xs">{label}</p>
        <p className="tnum mt-0.5 truncate text-base font-bold sm:text-xl">
          {value}
        </p>
      </div>
    </div>
  );
}
