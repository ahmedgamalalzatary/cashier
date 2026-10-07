"use client";
import { useEffect, useMemo, useState } from "react";
import { Printer, RefreshCw } from "lucide-react";
import { ReportTable } from "../components/reports/report-table";
import { Button } from "../components/ui/button";
import { PageHeader } from "../components/ui/page-header";
import { TabPanel, Tabs } from "../components/ui/tabs";
import { ErrorBanner, LoadingState } from "../components/ui/states";
import { cairoCalendarDate } from "../lib/cairo-date";
import { formatMoney } from "../lib/format";
import type { ReportTable as TableData } from "../models/reports-model";
import { isReportRangeReady, reportTotal } from "../models/reports-model";
import { getReports, type ReportsData } from "../services/reports-service";
import { useBranch } from "../components/branches/branch-provider";

const tabs = [
  ["sales", "المبيعات ومجمل الربح"],
  ["stock", "المخزون والحركة"],
  ["money", "الأموال والمصروفات"],
  ["employees", "الموظفون ووقت العمل"],
  ["waste", "الهالك والمرتجعات"],
  ["suppliers", "الموردون"],
  ["operations", "التحويلات والتحضير"],
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
// An auto-closed shift has no counted drawer, so the cell says so instead of
// showing a zero that would read as "balanced".
const uncountedMoney = (key: string, label: string) => ({
  key,
  label,
  kind: "uncountedMoney" as const,
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
          money("profit", "مجمل الربح"),
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
          money("profit", "مجمل الربح"),
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
          money("profit", "مجمل الربح"),
        ],
      },
      {
        title: "مبيعات الورديات خلال الفترة",
        note: "المبيعات والخصومات والمرتجعات والتكلفة تخص الفترة المختارة، ولو فتحت الوردية قبلها.",
        rows: d.sales.byShift,
        columns: [
          number("shiftId", "الوردية"),
          { key: "cashierName", label: "الكاشير" },
          date("openedAt", "الفتح"),
          money("sales", "المبيعات"),
          money("refunds", "المرتجعات"),
          money("discounts", "الخصومات"),
          money("cost", "تكلفة المبيعات"),
          money("returnedCost", "التكلفة المرتجعة"),
          money("profit", "مجمل الربح"),
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
          money("profit", "مجمل الربح"),
        ],
      },
    ];
  if (tab === "stock")
    return [
      {
        title: "المخزون الحالي وقيمة FIFO",
        note: "الأرصدة الحالية وقت تحميل التقرير؛ لا تمثل رصيد نهاية الفترة المختارة.",
        rows: d.stock.current,
        columns: [
          number("code", "الكود"),
          { key: "name", label: "الصنف" },
          { key: "warehouse", label: "المخزن", kind: "warehouse" },
          number("quantity", "الكمية"),
          { key: "stockUnit", label: "الوحدة" },
          money("stockValue", "القيمة"),
          number("minimumLevel", "حد التنبيه"),
        ],
      },
      {
        title: "قائمة المخزون المنخفض والسالب",
        note: "تنبيهات الأرصدة الحالية وقت تحميل التقرير.",
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
          {
            key: "movementType",
            label: "الحركة",
            kind: "event",
            labelSet: "movement",
          },
          number("quantity", "الكمية"),
          money("totalCost", "التكلفة"),
          {
            key: "referenceType",
            label: "المرجع",
            kind: "event",
            labelSet: "reference",
          },
          number("referenceId", "رقم المرجع"),
          { key: "notes", label: "ملاحظات" },
        ],
      },
      {
        title: "سجل فروقات الجرد والتسويات",
        rows: d.stock.stocktakes,
        columns: [
          number("id", "المستند"),
          date("createdAt", "التاريخ"),
          {
            key: "kind",
            label: "النوع",
            kind: "event",
            labelSet: "stocktakeKind",
          },
          { key: "warehouse", label: "المخزن", kind: "warehouse" },
          number("lineCount", "الأصناف"),
          number("shortageQuantity", "العجز"),
          number("surplusQuantity", "الزيادة"),
          { key: "createdByName", label: "المسجل" },
          { key: "status", label: "الحالة", kind: "event", labelSet: "status" },
          date("confirmedAt", "التأكيد"),
          { key: "note", label: "ملاحظات" },
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
          { key: "type", label: "النوع", kind: "event", labelSet: "cashFlow" },
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
        title: "تفاصيل المصروفات",
        rows: d.money.expenses,
        columns: [
          number("id", "المستند"),
          date("expenseDate", "التاريخ"),
          { key: "categoryName", label: "التصنيف" },
          {
            key: "type",
            label: "النوع",
            kind: "event",
            labelSet: "expenseType",
          },
          number("shiftId", "الوردية"),
          money("amount", "المبلغ"),
          { key: "recordedByName", label: "المسجل" },
          { key: "note", label: "ملاحظات" },
        ],
      },
      {
        title: "زيادة / عجز الورديات",
        note: "أحداث الإغلاق والتصحيح التي حدثت خلال الفترة. المبالغ لقطة تسوية الوردية كاملة عند كل حدث؛ ليست حركة نقدية إضافية ولا تجمع الأحداث المتكررة للوردية نفسها.",
        rows: d.money.shiftOverShort,
        columns: [
          number("shiftId", "الوردية"),
          { key: "cashierName", label: "الكاشير" },
          date("occurredAt", "التاريخ"),
          {
            key: "action",
            label: "الإجراء",
            kind: "event",
            labelSet: "shiftAction",
          },
          money("expectedCash", "النقد المتوقع"),
          uncountedMoney("actualCash", "النقد الفعلي"),
          uncountedMoney("overShort", "الزيادة / العجز"),
          { key: "actorName", label: "المنفذ" },
          { key: "note", label: "ملاحظات" },
        ],
      },
    ];
  if (tab === "employees")
    return [
      {
        title: "وقت وعمل الكاشير",
        rows: d.employees.activity,
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
      {
        title: "الورديات الكاملة المرتبطة بالفترة",
        note: "الأرقام التالية تخص الوردية كاملة حتى وقت تحميل التقرير، وليست مبيعات الفترة فقط. المتوقع يشمل العهدة + المبيعات − المرتجعات − مصروفات الوردية.",
        rows: d.sales.byShift,
        columns: [
          number("shiftId", "الوردية"),
          { key: "cashierName", label: "الكاشير" },
          date("openedAt", "الفتح"),
          date("closedAt", "آخر إغلاق"),
          { key: "status", label: "الحالة", kind: "event", labelSet: "status" },
          money("openingFloat", "العهدة"),
          money("lifetimeSales", "كل المبيعات"),
          money("lifetimeRefunds", "كل المرتجعات"),
          money("lifetimeExpenses", "كل المصروفات"),
          money("expectedCash", "النقد المتوقع عند التسوية"),
          money("actualCash", "النقد الفعلي عند التسوية"),
          money("overShort", "آخر زيادة / عجز"),
        ],
      },
      {
        title: "سجل إجراءات الورديات",
        rows: d.employees.shiftHistory,
        columns: [
          date("occurredAt", "التاريخ"),
          number("shiftId", "الوردية"),
          { key: "cashierName", label: "الكاشير" },
          {
            key: "action",
            label: "الإجراء",
            kind: "event",
            labelSet: "shiftAction",
          },
          { key: "actorName", label: "المنفذ" },
          { key: "note", label: "ملاحظات" },
        ],
      },
      {
        title: "سجل المرتبات والسلف والتسويات",
        rows: d.employees.salaryHistory,
        columns: [
          date("occurredAt", "التاريخ"),
          { key: "employeeName", label: "الموظف" },
          {
            key: "type",
            label: "النوع",
            kind: "event",
            labelSet: "salaryHistory",
          },
          money("amount", "المبلغ"),
          { key: "periodMonth", label: "شهر الاستحقاق" },
          { key: "note", label: "ملاحظات" },
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
          {
            key: "reason",
            label: "السبب",
            kind: "event",
            labelSet: "wasteReason",
          },
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
          {
            key: "reason",
            label: "السبب",
            kind: "event",
            labelSet: "wasteReason",
          },
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
  if (tab === "operations")
    return [
      {
        title: "التحويلات المنفذة من الرئيسي إلى الكافيه",
        rows: d.operations.transfers,
        columns: [
          number("id", "التحويل"),
          date("occurredAt", "التاريخ"),
          number("requestId", "الطلب"),
          number("itemCount", "عدد الأصناف"),
          money("totalCost", "التكلفة المنقولة"),
          { key: "createdByName", label: "المسجل" },
          { key: "approvedByName", label: "المعتمد" },
          { key: "notes", label: "ملاحظات" },
        ],
      },
      {
        title: "أصناف التحويلات المنفذة",
        rows: d.operations.transferLines,
        columns: [
          number("transferId", "التحويل"),
          date("occurredAt", "التاريخ"),
          { key: "itemName", label: "الصنف" },
          number("quantity", "الكمية"),
          { key: "stockUnit", label: "الوحدة" },
          money("totalCost", "التكلفة"),
        ],
      },
      {
        title: "طلبات التحويل",
        note: "الطلبات المنشأة خلال الفترة مع حالتها الحالية وقت تحميل التقرير.",
        rows: d.operations.requests,
        columns: [
          number("id", "الطلب"),
          date("createdAt", "الإنشاء"),
          { key: "status", label: "الحالة", kind: "event", labelSet: "status" },
          number("itemCount", "عدد الأصناف"),
          { key: "requestedByName", label: "الطالب" },
          { key: "reviewedByName", label: "المراجع" },
          date("reviewedAt", "المراجعة"),
          { key: "rejectionReason", label: "سبب الرفض" },
          { key: "notes", label: "ملاحظات" },
        ],
      },
      {
        title: "أصناف طلبات التحويل",
        rows: d.operations.requestLines,
        columns: [
          number("requestId", "الطلب"),
          { key: "itemName", label: "الصنف" },
          number("quantity", "الكمية"),
          { key: "stockUnit", label: "الوحدة" },
        ],
      },
      {
        title: "تحضير الوصفات",
        rows: d.operations.preparations,
        columns: [
          number("id", "التحضير"),
          date("occurredAt", "التاريخ"),
          { key: "recipeName", label: "الوصفة" },
          { key: "outputItemName", label: "الصنف المنتج" },
          number("producedQuantity", "الكمية المنتجة"),
          { key: "stockUnit", label: "الوحدة" },
          money("totalCost", "التكلفة"),
          { key: "preparedByName", label: "المحضر" },
          { key: "notes", label: "ملاحظات" },
        ],
      },
      {
        title: "المكونات المستهلكة في التحضير",
        rows: d.operations.ingredients,
        columns: [
          number("preparationId", "التحضير"),
          { key: "itemName", label: "المكون" },
          number("quantity", "الكمية"),
          { key: "stockUnit", label: "الوحدة" },
          money("totalCost", "التكلفة"),
        ],
      },
    ];
  return [
    {
      title: "ملخص أرصدة الموردين",
      note: "رصيد حالي يشمل الرصيد الافتتاحي وجميع المشتريات والمدفوعات، وليس رصيد نهاية الفترة المختارة.",
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
        { key: "createdByName", label: "المسجل" },
        { key: "notes", label: "ملاحظات" },
      ],
    },
    {
      title: "أصناف فواتير المشتريات",
      rows: d.suppliers.purchaseLines,
      columns: [
        number("invoiceId", "الفاتورة"),
        date("purchasedAt", "التاريخ"),
        { key: "supplierName", label: "المورد" },
        { key: "itemName", label: "الصنف" },
        number("stockQuantity", "كمية المخزون"),
        { key: "stockUnit", label: "الوحدة" },
        money("unitCost", "تكلفة الوحدة"),
        money("lineTotal", "الإجمالي"),
      ],
    },
    {
      title: "دفعات الموردين",
      rows: d.suppliers.payments,
      columns: [
        date("paidAt", "التاريخ"),
        { key: "supplierName", label: "المورد" },
        money("amount", "المبلغ"),
        number("purchaseInvoiceId", "الفاتورة المرتبطة"),
        { key: "notes", label: "ملاحظات" },
      ],
    },
  ];
}
export function ReportsPage() {
  const today = cairoCalendarDate(),
    monthStart = `${today.slice(0, 7)}-01`;
  const { branch } = useBranch();
  const [from, setFrom] = useState(monthStart),
    [to, setTo] = useState(today),
    [tab, setTab] = useState<Tab>("sales");
  const [loadedData, setData] = useState<ReportsData | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [request, setRequest] = useState({
    from: monthStart,
    to: today,
    revision: 0,
  });
  const load = (start = from, end = to) => {
    if (!isReportRangeReady(start, end)) return;
    setLoading(true);
    setError("");
    setData(null);
    setRequest({ from: start, to: end, revision: request.revision + 1 });
  };
  useEffect(() => {
    let cancelled = false;
    getReports(request.from, request.to)
      .then((value) => {
        if (cancelled) return;
        if (value.range.branchId !== branch.id)
          throw new Error("التقرير لا يخص الفرع الحالي؛ أعد تحميله");
        setData(value);
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
  }, [request, branch.id]);
  const data = loadedData?.range.branchId === branch.id ? loadedData : null;
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
              disabled={loading || !isReportRangeReady(from, to)}
            >
              <RefreshCw className="size-4" />
              تحديث
            </Button>
            <Button
              onClick={() => {
                if (
                  data &&
                  !loading &&
                  !error &&
                  data.range.branchId === branch.id
                )
                  window.print();
              }}
              disabled={
                !data ||
                loading ||
                Boolean(error) ||
                data.range.branchId !== branch.id
              }
            >
              <Printer className="size-4" />
              طباعة / PDF
            </Button>
          </div>
        }
      />
      <div className="print-controls toolbar">
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">من</span>
          <input
            aria-label="من"
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="input"
          />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">إلى</span>
          <input
            aria-label="إلى"
            type="date"
            value={to}
            min={from}
            max={today}
            onChange={(e) => setTo(e.target.value)}
            className="input"
          />
        </label>
      </div>
      <div className="print-controls">
        <Tabs
          idPrefix="reports"
          items={tabs.map(([id, label]) => ({ id, label }))}
          active={tab}
          onChange={setTab}
          ariaLabel="أقسام التقارير"
        />
      </div>
      <TabPanel idPrefix="reports" active={tab}>
        {data && (
          <div className="space-y-2 rounded-xl border border-line bg-surface p-4 print:border-0">
            <p>{branch.name}</p>
            <p>
              الفترة: {data.range.from} — {data.range.to}
            </p>
            <p className="text-xs text-muted">
              توقيت القاهرة · وقت التحميل:{" "}
              {new Date(data.range.generatedAt).toLocaleString("ar-EG", {
                timeZone: "Africa/Cairo",
              })}
            </p>
            <h2 className="text-xl font-bold">
              {tabs.find(([key]) => key === tab)?.[1]}
            </h2>
            {(from !== data.range.from || to !== data.range.to) && (
              <p className="print-controls text-sm text-muted">
                التواريخ المختارة لم تطبق بعد. حدّث التقرير؛ الطباعة تستخدم
                الفترة المحملة أعلاه.
              </p>
            )}
            <p className="text-sm text-muted">
              تقارير العمليات المسجلة في هذا الفرع. مبيعات الأونلاين وتكاليف
              خصمها وسجل تعديل المعاملات لم تتوفر بعد.
            </p>
            {tab === "sales" && (
              <>
                <p className="text-sm text-muted">
                  مجمل الربح = المبيعات − المرتجعات − تكلفة المبيعات + التكلفة
                  المرتجعة. لا تخصم منه المصروفات أو الرواتب أو الهالك.
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    [
                      "صافي المبيعات",
                      reportTotal(data.sales.byDay, "sales") -
                        reportTotal(data.sales.byDay, "refunds"),
                    ],
                    [
                      "صافي تكلفة المبيعات",
                      reportTotal(data.sales.byDay, "cost") -
                        reportTotal(data.sales.byDay, "returnedCost"),
                    ],
                    ["مجمل الربح", reportTotal(data.sales.byDay, "profit")],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg bg-paper p-3">
                      <p className="text-sm text-muted">{label}</p>
                      <p className="tnum font-bold">{formatMoney(value)}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        {error && <ErrorBanner>{error}</ErrorBanner>}
        {loading ? (
          <LoadingState label="جارِ تحميل التقرير…" />
        ) : (
          <div className="space-y-8">
            {visible.map((table) => (
              <ReportTable key={table.title} {...table} />
            ))}
          </div>
        )}
      </TabPanel>
    </div>
  );
}
