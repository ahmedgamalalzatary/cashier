"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import type { OrderSummary } from "@cashier/shared";
import {
  Coins,
  ReceiptText,
  Scissors,
  Search,
  TriangleAlert,
} from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Table } from "@/components/ui/table";
import { cairoCalendarDate } from "@/lib/cairo-date";
import { formatMoney } from "@/lib/format";
import {
  filterOrders,
  orderCashiers,
  orderMargin,
  ordersTotals,
  splitOrderNumber,
} from "@/models/orders-model";
import { listOrders } from "@/services/orders-service";

const dayFormat = new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium" });
const timeFormat = new Intl.DateTimeFormat("ar-EG", {
  timeZone: "Africa/Cairo",
  hour: "numeric",
  minute: "2-digit",
});

export default function OrdersPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [cashierId, setCashierId] = useState("");
  const [day, setDay] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    listOrders()
      .then((rows) => {
        if (cancelled) return;
        setOrders(rows);
        setError("");
      })
      .catch((caught) => {
        if (cancelled) return;
        setError(
          caught instanceof Error ? caught.message : "تعذر تحميل الطلبات",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const cashiers = useMemo(() => orderCashiers(orders), [orders]);
  const visibleRows = useMemo(
    () =>
      filterOrders(orders, {
        query,
        cashierId: cashierId ? Number(cashierId) : null,
        day,
      }),
    [orders, query, cashierId, day],
  );
  const totals = useMemo(() => ordersTotals(visibleRows), [visibleRows]);
  const flagged = visibleRows.filter((row) => row.isNegativeStock).length;

  return (
    <div>
      <PageHeader
        title="الطلبات"
        actions={
          <span className="text-sm text-muted">
            آخر ما سُجّل على الكاونتر، الأحدث أولاً
          </span>
        }
      />

      <section className="mb-6 overflow-hidden rounded-2xl border border-line bg-sidebar text-white shadow-[0_16px_45px_rgb(43_33_24/0.10)]">
        <div className="grid divide-y divide-white/10 sm:grid-cols-2 sm:divide-x sm:divide-x-reverse sm:divide-y-0 lg:grid-cols-4">
          <Summary
            icon={<ReceiptText className="size-5 text-accent" />}
            label="عدد الطلبات المعروضة"
            value={totals.countLabel}
          />
          <Summary
            icon={<Coins className="size-5 text-accent" />}
            label="إجمالي المبيعات"
            value={totals.sales}
          />
          <Summary
            icon={<Scissors className="size-5 text-accent" />}
            label="إجمالي الخصومات"
            value={totals.discounts}
          />
          <Summary
            icon={<TriangleAlert className="size-5 text-danger" />}
            label="طلبات برصيد سالب"
            value={String(flagged)}
            danger={flagged > 0}
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

      <div className="mb-4 grid gap-3 rounded-xl border border-line bg-surface p-3 md:grid-cols-[minmax(14rem,1fr)_13rem_12rem]">
        <label className="relative block">
          <Search className="pointer-events-none absolute right-3 top-2.5 size-4 text-muted" />
          <input
            aria-label="البحث عن طلب"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ابحث برقم الطلب أو اسم الكاشير"
            className="w-full rounded-lg border border-line bg-paper/40 py-2 pe-3 ps-9 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>
        <select
          aria-label="تصفية حسب الكاشير"
          value={cashierId}
          onChange={(event) => setCashierId(event.target.value)}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="">كل الكاشيرية</option>
          {cashiers.map((cashier) => (
            <option key={cashier.id} value={cashier.id}>
              {cashier.name}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <input
            aria-label="تصفية حسب اليوم"
            type="date"
            value={day}
            onChange={(event) => setDay(event.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={() => setDay(day ? "" : cairoCalendarDate())}
            className="shrink-0 rounded-lg border border-line px-3 py-2 text-sm text-muted hover:border-primary hover:text-primary"
          >
            {day ? "كل الأيام" : "اليوم"}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-muted">جارِ تحميل سجل الطلبات…</p>
      ) : orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-surface p-10 text-center">
          <ReceiptText className="mx-auto mb-3 size-8 text-muted" />
          <p className="font-medium">لم يُسجَّل أي طلب بعد</p>
          <p className="mt-1 text-sm text-muted">
            أول عملية بيع من نقطة البيع تظهر هنا فوراً.
          </p>
        </div>
      ) : visibleRows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-muted">
          لا توجد طلبات تطابق عوامل التصفية الحالية.
        </p>
      ) : (
        <Table
          headers={[
            "رقم الطلب",
            "الوقت",
            "الكاشير",
            "الخصم",
            "الإجمالي",
            ...(isAdmin ? ["التكلفة", "الربح"] : []),
            "الحالة",
          ]}
        >
          {visibleRows.map((row) => {
            const { prefix, code } = splitOrderNumber(row.orderNumber);
            const margin = orderMargin(row);
            const createdAt = new Date(row.createdAt);
            return (
              <tr key={row.id} className="hover:bg-paper/50">
                <td className="px-4 py-3">
                  <Link
                    href={`/orders/${row.id}`}
                    className="block hover:text-primary"
                  >
                    <span className="block font-bold tnum">{code}</span>
                    {prefix && (
                      <span className="block text-xs tnum text-muted">
                        {prefix}
                      </span>
                    )}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className="block tnum">{timeFormat.format(createdAt)}</span>
                  <span className="block text-xs tnum text-muted">
                    {dayFormat.format(createdAt)}
                  </span>
                </td>
                <td className="px-4 py-3">{row.cashierName}</td>
                <td className="px-4 py-3 tnum text-muted">
                  {Number(row.discountAmount) > 0
                    ? formatMoney(row.discountAmount)
                    : "—"}
                </td>
                <td className="px-4 py-3 tnum font-bold">
                  {formatMoney(row.total)}
                </td>
                {isAdmin && (
                  <td className="px-4 py-3 tnum text-muted">{margin.cost}</td>
                )}
                {isAdmin && (
                  <td
                    className={`px-4 py-3 tnum font-medium ${
                      Number(row.total) < Number(row.totalCost)
                        ? "text-danger"
                        : "text-success"
                    }`}
                  >
                    {margin.profit}
                  </td>
                )}
                <td className="px-4 py-3">
                  {row.isNegativeStock ? (
                    <Badge tone="danger">رصيد سالب</Badge>
                  ) : (
                    <Badge tone="success">مكتمل</Badge>
                  )}
                </td>
              </tr>
            );
          })}
        </Table>
      )}
    </div>
  );
}

function Summary({
  icon,
  label,
  value,
  danger = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-4">
      <div className="rounded-lg bg-white/8 p-2">{icon}</div>
      <div>
        <p className="text-xs text-sidebar-ink">{label}</p>
        <p
          className={`tnum mt-0.5 text-xl font-bold ${danger ? "text-accent" : ""}`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}
