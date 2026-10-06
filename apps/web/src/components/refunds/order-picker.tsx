"use client";

import { useMemo, useState } from "react";
import { RotateCcw, Search } from "lucide-react";
import type { OrderSummary } from "@cashier/shared";
import { Button } from "@/components/ui/button";
import { DataTable, type DataColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/states";
import { formatMoney } from "@/lib/format";
import { matchesQuery } from "@/lib/search";

/** Search + order table, so every place that offers a refund looks the same. */
export function OrderPicker({
  orders,
  onPick,
}: {
  orders: OrderSummary[];
  onPick: (orderId: number) => void;
}) {
  const [query, setQuery] = useState("");
  const visibleOrders = useMemo(
    () => orders.filter((row) => matchesQuery(query, row.orderNumber, row.cashierName)),
    [orders, query],
  );

  const columns: DataColumn<OrderSummary>[] = [
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
      cell: (row) => <span className="font-bold">{formatMoney(row.total)}</span>,
    },
  ];

  return (
    <div>
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
        columns={columns}
        empty={
          <EmptyState
            icon={<RotateCcw className="size-8" />}
            title="لا توجد طلبات"
            description="لا توجد طلبات مطابقة للبحث."
          />
        }
        actions={(row) => (
          <Button variant="ghost" size="sm" onClick={() => onPick(row.id)}>
            اختيار
          </Button>
        )}
      />
    </div>
  );
}
