"use client";
import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/format";
import {
  getReportsDashboard,
  type DashboardData,
} from "@/services/reports-service";

const cards = [
  ["sales", "مبيعات اليوم", "money"],
  ["refunds", "مرتجعات اليوم", "money"],
  ["discounts", "خصومات اليوم", "money"],
  ["grossProfit", "مجمل الربح", "money"],
  ["ordersCount", "عدد الطلبات", "number"],
  ["pendingTransfers", "تحويلات معلّقة", "number"],
] as const;
export function AdminMetrics() {
  const [data, setData] = useState<DashboardData | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    getReportsDashboard()
      .then((v) => {
        if (!cancelled) setData(v);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  if (error)
    return (
      <p
        role="alert"
        className="rounded-xl bg-danger/10 p-3 text-sm text-danger"
      >
        تعذر تحميل ملخص الإدارة: {error}
      </p>
    );
  if (!data)
    return <p className="text-sm text-muted">جارِ تحميل ملخص الإدارة…</p>;
  const negatives = data.stock.filter((row) => Number(row.quantity) < 0).length;
  return (
    <section className="mb-7 space-y-3">
      <h2 className="font-bold">ملخص اليوم</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([key, label, kind]) => (
          <div
            key={key}
            className="rounded-xl border border-line bg-surface p-4"
          >
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-1 text-xl font-bold tnum">
              {kind === "money"
                ? formatMoney(data.summary?.[key] ?? 0)
                : Number(data.summary?.[key] ?? 0).toLocaleString("ar-EG")}
            </p>
          </div>
        ))}
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-xs text-muted">أصناف تحت حد التنبيه</p>
          <p className="mt-1 text-xl font-bold tnum">
            {data.stock.length.toLocaleString("ar-EG")}
          </p>
        </div>
        <div
          className={`rounded-xl border p-4 ${negatives ? "border-danger/40 bg-danger/5" : "border-line bg-surface"}`}
        >
          <p className="text-xs text-muted">أرصدة سالبة</p>
          <p className="mt-1 text-xl font-bold tnum">
            {negatives.toLocaleString("ar-EG")}
          </p>
        </div>
      </div>
      {data.openShift && (
        <p className="rounded-xl border border-line bg-surface p-3 text-sm">
          الوردية المفتوحة: <b>{String(data.openShift.cashierName)}</b> —
          المبيعات {formatMoney(data.openShift.sales ?? 0)}
        </p>
      )}
    </section>
  );
}
