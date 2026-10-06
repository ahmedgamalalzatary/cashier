"use client";
import { useEffect, useState } from "react";
import { Coins, Receipt, Scissors, ShoppingBag, TrendingUp } from "lucide-react";
import { Stat, StatStrip } from "@/components/ui/stat";
import { ErrorBanner, LoadingState } from "@/components/ui/states";
import { formatMoney } from "@/lib/format";
import {
  getReportsDashboard,
  type DashboardData,
} from "@/services/reports-service";

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
      <ErrorBanner className="mb-6">تعذر تحميل ملخص الإدارة: {error}</ErrorBanner>
    );
  if (!data)
    return <LoadingState label="جارِ تحميل ملخص الإدارة…" className="mb-6" />;

  const negatives = data.stock.filter((row) => Number(row.quantity) < 0).length;
  const summary = data.summary;
  const money = (key: keyof NonNullable<DashboardData["summary"]>) =>
    formatMoney(summary?.[key] ?? 0);
  const count = (key: keyof NonNullable<DashboardData["summary"]>) =>
    Number(summary?.[key] ?? 0).toLocaleString("ar-EG");

  return (
    <section className="mb-6 space-y-3">
      <h2 className="text-sm font-bold text-muted">ملخص اليوم</h2>
      <StatStrip>
        <Stat label="مبيعات اليوم" value={money("sales")} icon={<Coins className="size-4" />} />
        <Stat label="مرتجعات اليوم" value={money("refunds")} icon={<Receipt className="size-4" />} />
        <Stat label="خصومات اليوم" value={money("discounts")} icon={<Scissors className="size-4" />} />
        <Stat label="مجمل الربح" value={money("grossProfit")} icon={<TrendingUp className="size-4" />} />
        <Stat label="عدد الطلبات" value={count("ordersCount")} icon={<ShoppingBag className="size-4" />} />
        <Stat
          label="تحويلات معلّقة"
          value={count("pendingTransfers")}
          tone={Number(summary?.pendingTransfers ?? 0) > 0 ? "danger" : "default"}
        />
        <Stat label="أصناف تحت حد التنبيه" value={data.stock.length.toLocaleString("ar-EG")} />
        <Stat
          label="أرصدة سالبة"
          value={negatives.toLocaleString("ar-EG")}
          tone={negatives > 0 ? "danger" : "default"}
        />
      </StatStrip>
      {data.openShifts.length > 0 && (
        <ul className="ledger sheet">
          {data.openShifts.map((shift) => (
            <li
              key={shift.id}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"
            >
              <span>
                الوردية <b className="tnum">#{shift.id}</b>: {String(shift.cashierName)}
              </span>
              <span className="tnum text-muted">
                المبيعات {formatMoney(shift.sales ?? 0)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
