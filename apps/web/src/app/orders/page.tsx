"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { OrderSummary } from "@cashier/shared";
import {
  Coins,
  ReceiptText,
  Scissors,
  Search,
  TriangleAlert,
} from "lucide-react";
import { useAuth } from "@cashier/web-core/components/auth/auth-provider";
import { ExternalOrdersPanel } from "@/components/orders/external-orders-panel";
import { Badge } from "@cashier/web-core/components/ui/badge";
import { DataTable, type DataColumn } from "@cashier/web-core/components/ui/data-table";
import { PageHeader } from "@cashier/web-core/components/ui/page-header";
import { Stat, StatStrip } from "@cashier/web-core/components/ui/stat";
import { TabPanel, Tabs } from "@cashier/web-core/components/ui/tabs";
import { EmptyState, ErrorBanner, LoadingState } from "@cashier/web-core/components/ui/states";
import { cairoCalendarDate } from "@cashier/web-core/lib/cairo-date";
import { formatMoney } from "@cashier/web-core/lib/format";
import {
  filterOrders,
  orderCashiers,
  orderMargin,
  ordersTotals,
  splitOrderNumber,
} from "@/models/orders-model";
import { listOrders } from "@/services/orders-service";

type OrdersTab = "cashier" | "online";

const dayFormat = new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium" });
const timeFormat = new Intl.DateTimeFormat("ar-EG", {
  timeZone: "Africa/Cairo",
  hour: "numeric",
  minute: "2-digit",
});

export default function OrdersPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [activeTab, setActiveTab] = useState<OrdersTab>("cashier");
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
        cashierId: cashierId ? cashierId : null,
        day,
      }),
    [orders, query, cashierId, day],
  );
  const totals = useMemo(() => ordersTotals(visibleRows), [visibleRows]);
  const flagged = visibleRows.filter((row) => row.isNegativeStock).length;

  const columns: DataColumn<OrderSummary>[] = [
    {
      key: "orderNumber",
      header: "رقم الطلب",
      mobile: "primary",
      cell: (row) => {
        const { prefix, code } = splitOrderNumber(row.orderNumber);
        return (
          <Link
            href={`/orders/detail?id=${row.id}`}
            className="block hover:text-primary"
          >
            <span className="tnum block font-bold">{code}</span>
            {prefix && (
              <span className="tnum block truncate text-xs text-muted">
                {prefix}
              </span>
            )}
          </Link>
        );
      },
    },
    {
      key: "createdAt",
      header: "الوقت",
      cell: (row) => {
        const createdAt = new Date(row.createdAt);
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
      key: "cashier",
      header: "الكاشير",
      cell: (row) => (
        <span className="flex flex-wrap items-center gap-2">
          {row.cashierName}
          {row.isAdminSale && <Badge tone="neutral">إداري</Badge>}
        </span>
      ),
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
        <span className="font-bold">{formatMoney(row.total)}</span>
      ),
    },
    ...(isAdmin
      ? ([
          {
            key: "cost",
            header: "التكلفة",
            numeric: true,
            cell: (row) => orderMargin(row).cost,
          },
          {
            key: "profit",
            header: "الربح",
            numeric: true,
            cell: (row) => {
              const margin = orderMargin(row);
              const loss = Number(row.total) < Number(row.totalCost);
              return (
                <span className={loss ? "text-danger" : "text-success"}>
                  {margin.profit}
                </span>
              );
            },
          },
        ] satisfies DataColumn<OrderSummary>[])
      : []),
    {
      key: "status",
      header: "الحالة",
      cell: (row) =>
        row.isNegativeStock ? (
          <Badge tone="danger">رصيد سالب</Badge>
        ) : (
          <Badge tone="success">مكتمل</Badge>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="الطلبات"
        description={
          activeTab === "cashier"
            ? "آخر ما سُجّل على الكاونتر، الأحدث أولاً"
            : "طلبات الأونلاين من نظام الطلبات، الأحدث أولاً"
        }
      />

      <Tabs
        idPrefix="orders"
        items={[
          { id: "cashier", label: "طلبات الكاشير" },
          { id: "online", label: "طلبات الأونلاين" },
        ]}
        active={activeTab}
        onChange={setActiveTab}
        ariaLabel="مصدر الطلبات"
        className="mb-5"
      />

      <TabPanel idPrefix="orders" active={activeTab}>
        <section hidden={activeTab !== "cashier"}>
          <StatStrip className="mb-5">
            <Stat
              icon={<ReceiptText className="size-4" />}
              label="عدد الطلبات المعروضة"
              value={totals.countLabel}
            />
            <Stat
              icon={<Coins className="size-4" />}
              label="إجمالي المبيعات"
              value={totals.sales}
            />
            <Stat
              icon={<Scissors className="size-4" />}
              label="إجمالي الخصومات"
              value={totals.discounts}
            />
            <Stat
              icon={<TriangleAlert className="size-4" />}
              label="طلبات برصيد سالب"
              value={String(flagged)}
              tone={flagged > 0 ? "danger" : "default"}
            />
          </StatStrip>

          {error && <ErrorBanner className="mb-4">{error}</ErrorBanner>}

          <div className="toolbar mb-4">
            <label className="relative min-w-[14rem] flex-1">
              <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-muted" />
              <input
                aria-label="البحث عن طلب"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ابحث برقم الطلب أو اسم الكاشير"
                className="input ps-9"
              />
            </label>
            <select
              aria-label="تصفية حسب الكاشير"
              value={cashierId}
              onChange={(event) => setCashierId(event.target.value)}
              className="input w-auto"
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
                className="input w-auto"
              />
              <button
                type="button"
                onClick={() => setDay(day ? "" : cairoCalendarDate())}
                className="shrink-0 rounded-lg border border-line px-3 text-sm text-muted transition-colors hover:border-primary hover:text-primary"
              >
                {day ? "كل الأيام" : "اليوم"}
              </button>
            </div>
          </div>

          {loading ? (
            <LoadingState label="جارِ تحميل سجل الطلبات…" />
          ) : (
            <DataTable
              caption="سجل طلبات الكاشير"
              rows={visibleRows}
              rowKey={(row) => row.id}
              columns={columns}
              empty={
                orders.length === 0 ? (
                  <EmptyState
                    icon={<ReceiptText className="size-8" />}
                    title="لم يُسجَّل أي طلب بعد"
                    description="أول عملية بيع من نقطة البيع تظهر هنا فوراً."
                  />
                ) : (
                  <p className="empty-state text-sm text-muted">
                    لا توجد طلبات تطابق عوامل التصفية الحالية.
                  </p>
                )
              }
            />
          )}
        </section>

        <section hidden={activeTab !== "online"}>
          <ExternalOrdersPanel />
        </section>
      </TabPanel>
    </div>
  );
}
