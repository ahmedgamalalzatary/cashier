"use client";
import { useEffect, useMemo, useState } from "react";
import { Printer, RefreshCw } from "lucide-react";
import { ReportTable } from "@/components/reports/report-table";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { cairoCalendarDate } from "@/lib/cairo-date";
import type { ReportTable as TableData } from "@/models/reports-model";
import { getReports, type ReportsData } from "@/services/reports-service";

const today = cairoCalendarDate(),
  monthStart = `${today.slice(0, 7)}-01`;
const tabs = [
  ["sales", "المبيعات والربح"],
  ["stock", "المخزون والحركة"],
  ["money", "الأموال والمصروفات"],
  ["employees", "الموظفون ووقت العمل"],
  ["waste", "الهالك والمرتجعات"],
  ["suppliers", "الموردون"],
] as const;
type Tab = (typeof tabs)[number][0];
const money = (key: string, label: string) => ({
  key,
  label,
  kind: "money" as const,
});
const number = (key: string, label: string) => ({
  key,
  label,
  kind: "number" as const,
});
const date = (key: string, label: string) => ({
  key,
  label,
  kind: "date" as const,
});
function tables(d: ReportsData, tab: Tab): TableData[] {
  if (tab === "sales")
    return [
      {
        title: "حسب اليوم",
        rows: d.sales.byDay,
        columns: [
          { key: "day", label: "اليوم" },
          money("sales", "المبيعات"),
          money("discounts", "الخصومات"),
          money("refunds", "المرتجعات"),
          money("cost", "التكلفة"),
          money("profit", "الربح"),
          number("ordersCount", "الطلبات"),
        ],
      },
      {
        title: "حسب المنتج",
        rows: d.sales.byProduct,
        columns: [
          { key: "productName", label: "المنتج" },
          { key: "sizeName", label: "الحجم" },
          number("quantity", "صافي الكمية"),
          money("sales", "المبيعات"),
          money("refunds", "المرتجعات"),
          money("cost", "التكلفة"),
          money("profit", "الربح"),
        ],
      },
      {
        title: "حسب التصنيف",
        rows: d.sales.byCategory,
        columns: [
          { key: "mainCategory", label: "الرئيسي" },
          { key: "category", label: "الفرعي" },
          money("sales", "المبيعات"),
          money("refunds", "المرتجعات"),
          money("cost", "التكلفة"),
          money("profit", "الربح"),
        ],
      },
      {
        title: "حسب الوردية",
        rows: d.sales.byShift,
        columns: [
          number("shiftId", "الوردية"),
          { key: "cashierName", label: "الكاشير" },
          date("openedAt", "الفتح"),
          money("sales", "المبيعات"),
          money("refunds", "المرتجعات"),
          money("profit", "الربح"),
        ],
      },
      {
        title: "حسب الكاشير",
        rows: d.sales.byCashier,
        columns: [
          { key: "cashierName", label: "الكاشير" },
          number("ordersCount", "الطلبات"),
          money("sales", "المبيعات"),
          money("discounts", "الخصومات"),
          money("refunds", "المرتجعات"),
          money("profit", "الربح"),
        ],
      },
    ];
  if (tab === "stock")
    return [
      {
        title: "المخزون الحالي وقيمة FIFO",
        rows: d.stock.current,
        columns: [
          number("code", "الكود"),
          { key: "name", label: "الصنف" },
          { key: "warehouse", label: "المخزن", kind: "warehouse" },
          number("quantity", "الكمية"),
          money("stockValue", "القيمة"),
          number("minimumLevel", "حد التنبيه"),
        ],
      },
      {
        title: "قائمة المخزون المنخفض والسالب",
        rows: d.stock.lowStock,
        columns: [
          number("code", "الكود"),
          { key: "name", label: "الصنف" },
          { key: "warehouse", label: "المخزن", kind: "warehouse" },
          number("quantity", "الكمية"),
          number("minimumLevel", "حد التنبيه"),
        ],
      },
      {
        title: "دفتر حركة المخزون",
        rows: d.stock.ledger,
        columns: [
          date("occurredAt", "التاريخ"),
          number("code", "الكود"),
          { key: "itemName", label: "الصنف" },
          { key: "warehouse", label: "المخزن", kind: "warehouse" },
          { key: "movementType", label: "الحركة", kind: "event" },
          number("quantity", "الكمية"),
          money("totalCost", "التكلفة"),
          { key: "referenceType", label: "المرجع", kind: "event" },
        ],
      },
    ];
  if (tab === "money")
    return [
      {
        title: "التدفق النقدي",
        rows: d.money.cashFlow,
        columns: [
          date("occurredAt", "التاريخ"),
          { key: "type", label: "النوع", kind: "event" },
          { key: "reference", label: "المرجع" },
          money("amount", "المبلغ"),
        ],
      },
      {
        title: "المصروفات حسب التصنيف",
        rows: d.money.expenseBreakdown,
        columns: [
          { key: "categoryName", label: "التصنيف" },
          number("entriesCount", "العدد"),
          money("amount", "الإجمالي"),
        ],
      },
      {
        title: "زيادة / عجز الورديات",
        rows: d.money.shiftOverShort,
        columns: [
          number("shiftId", "الوردية"),
          { key: "cashierName", label: "الكاشير" },
          date("openedAt", "الفتح"),
          money("overShort", "الزيادة / العجز"),
        ],
      },
    ];
  if (tab === "employees")
    return [
      {
        title: "وقت وعمل الكاشير",
        rows: d.employees,
        columns: [
          { key: "name", label: "الموظف" },
          number("shiftsCount", "الورديات"),
          number("workedMinutes", "دقائق العمل"),
          number("ordersCount", "الطلبات"),
          money("discounts", "الخصومات"),
          number("refundsCount", "المرتجعات"),
          number("wasteCount", "الهالك"),
          number("expensesCount", "المصروفات"),
          number("transferRequestsCount", "طلبات التحويل"),
        ],
      },
    ];
  if (tab === "waste")
    return [
      {
        title: "ملخص الهالك",
        rows: d.wasteAndRefunds.wasteSummary,
        columns: [
          { key: "targetName", label: "الصنف / المنتج" },
          { key: "warehouse", label: "المخزن", kind: "warehouse" },
          { key: "reason", label: "السبب" },
          { key: "recordedByName", label: "المسجل" },
          number("entriesCount", "العدد"),
          number("quantity", "الكمية"),
          money("totalCost", "التكلفة"),
        ],
      },
      {
        title: "الهالك",
        rows: d.wasteAndRefunds.waste,
        columns: [
          date("occurredAt", "التاريخ"),
          { key: "targetName", label: "الصنف / المنتج" },
          { key: "warehouse", label: "المخزن", kind: "warehouse" },
          number("quantity", "الكمية"),
          { key: "reason", label: "السبب" },
          money("totalCost", "التكلفة"),
          { key: "recordedByName", label: "المسجل" },
        ],
      },
      {
        title: "ملخص المرتجعات",
        rows: d.wasteAndRefunds.refundSummary,
        columns: [
          { key: "productName", label: "المنتج" },
          { key: "sizeName", label: "الحجم" },
          { key: "reason", label: "السبب" },
          { key: "cashierName", label: "الكاشير" },
          number("refundsCount", "العدد"),
          number("quantity", "الكمية"),
          money("amount", "المبلغ"),
          money("returnedCost", "التكلفة المرتجعة"),
        ],
      },
      {
        title: "المرتجعات",
        rows: d.wasteAndRefunds.refunds,
        columns: [
          date("occurredAt", "التاريخ"),
          { key: "orderNumber", label: "الطلب" },
          { key: "cashierName", label: "الكاشير" },
          { key: "reason", label: "السبب" },
          money("amount", "المبلغ"),
          money("totalCostReturned", "التكلفة المرتجعة"),
        ],
      },
    ];
  return [
    {
      title: "ملخص أرصدة الموردين",
      rows: d.suppliers.summary,
      columns: [
        { key: "name", label: "المورد" },
        money("openingBalance", "الرصيد الافتتاحي"),
        money("purchases", "المشتريات"),
        money("payments", "المدفوعات"),
        money("balance", "الرصيد"),
      ],
    },
    {
      title: "المشتريات حسب المورد",
      rows: d.suppliers.purchases,
      columns: [
        date("purchasedAt", "التاريخ"),
        { key: "supplierName", label: "المورد" },
        { key: "invoiceNumber", label: "رقم الفاتورة" },
        money("totalAmount", "الإجمالي"),
        money("paidAmount", "المدفوع"),
      ],
    },
    {
      title: "دفعات الموردين",
      rows: d.suppliers.payments,
      columns: [
        date("paidAt", "التاريخ"),
        { key: "supplierName", label: "المورد" },
        money("amount", "المبلغ"),
        { key: "notes", label: "ملاحظات" },
      ],
    },
  ];
}
export default function ReportsPage() {
  const [from, setFrom] = useState(monthStart),
    [to, setTo] = useState(today),
    [tab, setTab] = useState<Tab>("sales");
  const [data, setData] = useState<ReportsData | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const load = (start = from, end = to) => {
    setLoading(true);
    setError("");
    getReports(start, end)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    let cancelled = false;
    getReports(monthStart, today)
      .then((value) => {
        if (!cancelled) setData(value);
      })
      .catch((cause: Error) => {
        if (!cancelled) setError(cause.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const visible = useMemo(() => (data ? tables(data, tab) : []), [data, tab]);
  return (
    <div className="report-print-root space-y-6">
      <PageHeader
        title="التقارير"
        actions={
          <div className="print-controls flex gap-2">
            <Button
              variant="ghost"
              onClick={() => load()}
              disabled={loading || from > to}
            >
              <RefreshCw className="size-4" />
              تحديث
            </Button>
            <Button onClick={() => window.print()} disabled={!data}>
              <Printer className="size-4" />
              طباعة / PDF
            </Button>
          </div>
        }
      />
      <div className="print-controls grid gap-3 rounded-xl border border-line bg-surface p-4 sm:grid-cols-2">
        <label className="text-sm">
          من
          <input
            aria-label="من"
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 block h-11 w-full rounded-lg border border-line bg-paper px-3"
          />
        </label>
        <label className="text-sm">
          إلى
          <input
            aria-label="إلى"
            type="date"
            value={to}
            min={from}
            max={today}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 block h-11 w-full rounded-lg border border-line bg-paper px-3"
          />
        </label>
      </div>
      <nav className="print-controls flex gap-2 overflow-x-auto pb-1">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`shrink-0 rounded-lg px-3 py-2 text-sm ${tab === key ? "bg-primary text-white" : "border border-line bg-surface"}`}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="hidden print:block">
        <p>
          الفترة: {from} — {to}
        </p>
        <h2 className="text-xl font-bold">
          {tabs.find(([key]) => key === tab)?.[1]}
        </h2>
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-danger/10 p-3 text-danger">
          {error}
        </p>
      )}
      {loading ? (
        <p className="text-muted">جارِ تحميل التقرير…</p>
      ) : (
        <div className="space-y-8">
          {visible.map((table) => (
            <ReportTable key={table.title} {...table} />
          ))}
        </div>
      )}
    </div>
  );
}
