"use client";

import { useEffect, useState } from "react";
import type { ExternalOrderSummary, ExternalOrdersPage } from "@cashier/shared";
import { Clock3, Coins, ReceiptText, Scissors, Search } from "lucide-react";
import { Badge } from "../ui/badge";
import { DataTable, type DataColumn } from "../ui/data-table";
import { Stat, StatStrip } from "../ui/stat";
import { EmptyState, ErrorBanner, LoadingState } from "../ui/states";
import { cairoCalendarDate } from "../../lib/cairo-date";
import { formatMoney } from "../../lib/format";
import {
  externalOrderStatus,
  externalOrderTypeLabel,
  externalPaymentMethodLabel,
  externalPaymentStatus,
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
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<
    ExternalOrdersPage["pagination"] | null
  >(null);
  const [totals, setTotals] = useState<ExternalOrdersPage["totals"] | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    listExternalOrders({ search: query, day, page, pageSize: 25 })
      .then((result) => {
        if (cancelled) return;
        setOrders(result.data);
        setPagination(result.pagination);
        setTotals(result.totals);
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
  }, [query, day, page]);

  return (
    <ExternalOrdersPanelView
      orders={orders}
      loading={loading}
      error={error}
      query={query}
      day={day}
      onQueryChange={(value) => {
        setLoading(true);
        setQuery(value);
        setPage(1);
      }}
      onDayChange={(value) => {
        setLoading(true);
        setDay(value);
        setPage(1);
      }}
      totals={totals ?? undefined}
      pagination={pagination ?? undefined}
      onPageChange={(value) => {
        setLoading(true);
        setPage(value);
      }}
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
  totals,
  pagination,
  onPageChange,
}: {
  orders: ExternalOrderSummary[];
  loading: boolean;
  error: string;
  query: string;
  day: string;
  onQueryChange: (query: string) => void;
  onDayChange: (day: string) => void;
  totals?: ExternalOrdersPage["totals"];
  pagination?: ExternalOrdersPage["pagination"];
  onPageChange?: (page: number) => void;
}) {
  const summary = totals ?? {
    count: orders.length,
    sales: orders
      .reduce((sum, row) => sum + Number(row.totalAmount), 0)
      .toFixed(2),
    discounts: orders
      .reduce((sum, row) => sum + Number(row.discountAmount), 0)
      .toFixed(2),
    pending: orders.filter((row) => row.orderStatus === "pending").length,
  };

  const columns: DataColumn<ExternalOrderSummary>[] = [
    {
      key: "id",
      header: "رقم الطلب",
      mobile: "primary",
      cell: (row) => <span className="tnum font-bold">#{row.id}</span>,
    },
    {
      key: "time",
      header: "الوقت",
      cell: (row) => {
        const createdAt = wallClockDate(row.createdAt);
        return (
          <>
            <span className="tnum block">{timeFormat.format(createdAt)}</span>
            <span className="tnum block text-xs text-muted">
              {dayFormat.format(createdAt)}
            </span>
          </>
        );
      },
    },
    {
      key: "customer",
      header: "العميل",
      cell: (row) => (
        <>
          <span className="block font-medium">{row.customerName}</span>
          {row.customerPhone && (
            <span className="tnum block text-xs text-muted" dir="ltr">
              {row.customerPhone}
            </span>
          )}
        </>
      ),
    },
    {
      key: "type",
      header: "نوع الطلب",
      cell: (row) => (
        <>
          <span className="block">{externalOrderTypeLabel(row.orderType)}</span>
          <span className="block text-xs text-muted">
            {row.itemCount.toLocaleString("ar-EG")} صنف
          </span>
        </>
      ),
    },
    {
      key: "payment",
      header: "الدفع",
      cell: (row) => {
        const payment = externalPaymentStatus(row.paymentStatus);
        return (
          <>
            <Badge tone={payment.tone}>{payment.label}</Badge>
            <span className="mt-1 block text-xs text-muted">
              {externalPaymentMethodLabel(row.paymentMethod)}
            </span>
          </>
        );
      },
    },
    {
      key: "discount",
      header: "الخصم",
      numeric: true,
      cell: (row) =>
        Number(row.discountAmount) > 0 ? (
          formatMoney(row.discountAmount)
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: "total",
      header: "الإجمالي",
      numeric: true,
      cell: (row) => (
        <span className="font-bold">{formatMoney(row.totalAmount)}</span>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      cell: (row) => {
        const status = externalOrderStatus(row.orderStatus);
        return <Badge tone={status.tone}>{status.label}</Badge>;
      },
    },
  ];

  return (
    <>
      <StatStrip className="mb-5">
        <Stat
          icon={<ReceiptText className="size-4" />}
          label="عدد الطلبات المعروضة"
          value={summary.count.toLocaleString("ar-EG")}
        />
        <Stat
          icon={<Coins className="size-4" />}
          label="إجمالي قيمة الطلبات"
          value={formatMoney(summary.sales)}
        />
        <Stat
          icon={<Scissors className="size-4" />}
          label="إجمالي الخصومات"
          value={formatMoney(summary.discounts)}
        />
        <Stat
          icon={<Clock3 className="size-4" />}
          label="طلبات قيد التنفيذ"
          value={summary.pending.toLocaleString("ar-EG")}
        />
      </StatStrip>

      {error && <ErrorBanner className="mb-4">{error}</ErrorBanner>}

      <div className="toolbar mb-4">
        <label className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted" />
          <input
            aria-label="البحث عن طلب أونلاين"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="ابحث برقم الطلب أو اسم العميل أو رقم الهاتف"
            className="input ps-9"
          />
        </label>
        <div className="flex gap-2">
          <input
            aria-label="تصفية طلبات الأونلاين حسب اليوم"
            type="date"
            value={day}
            onChange={(event) => onDayChange(event.target.value)}
            className="input w-auto"
          />
          <button
            type="button"
            onClick={() => onDayChange(day ? "" : cairoCalendarDate())}
            className="shrink-0 rounded-lg border border-line px-3 text-sm text-muted transition-colors hover:border-primary hover:text-primary"
          >
            {day ? "كل الأيام" : "اليوم"}
          </button>
        </div>
      </div>

      {error ? null : loading ? (
        <LoadingState label="جارِ تحميل طلبات الأونلاين…" />
      ) : (
        <>
          <DataTable
            caption="طلبات الأونلاين"
            rows={orders}
            rowKey={(row) => row.id}
            columns={columns}
            empty={
              orders.length === 0 && !query && !day ? (
                <EmptyState
                  icon={<ReceiptText className="size-8" />}
                  title="لا توجد طلبات أونلاين بعد"
                />
              ) : (
                <p className="empty-state text-sm text-muted">
                  لا توجد طلبات تطابق عوامل التصفية الحالية.
                </p>
              )
            }
          />
          {pagination && pagination.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                type="button"
                disabled={!pagination.hasPreviousPage}
                onClick={() => onPageChange?.(pagination.currentPage - 1)}
                className="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-40"
              >
                السابق
              </button>
              <span className="tnum text-sm text-muted">
                {pagination.currentPage.toLocaleString("ar-EG")} /{" "}
                {pagination.totalPages.toLocaleString("ar-EG")}
              </span>
              <button
                type="button"
                disabled={!pagination.hasNextPage}
                onClick={() => onPageChange?.(pagination.currentPage + 1)}
                className="rounded-lg border border-line px-3 py-2 text-sm disabled:opacity-40"
              >
                التالي
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
