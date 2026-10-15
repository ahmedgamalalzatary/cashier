"use client";
import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, Printer, RefreshCw } from "lucide-react";
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
import { tables } from "./reports/report-tables";
import { tabs, type Tab } from "./reports/report-tabs";

/** The loaded tab, exactly as on screen, for a site that offers a download. */
export type ReportExport = {
  branchName: string;
  from: string;
  to: string;
  section: string;
  tables: TableData[];
};

export function ReportsPage({
  excelDownload,
}: {
  /** Only the online site passes this; the desktop keeps print/PDF only. */
  excelDownload?: (report: ReportExport) => Promise<void>;
} = {}) {
  const today = cairoCalendarDate(),
    monthStart = `${today.slice(0, 7)}-01`;
  const { branch, error: branchError, refresh: refreshBranches } = useBranch();
  const [from, setFrom] = useState(monthStart),
    [to, setTo] = useState(today),
    [tab, setTab] = useState<Tab>("sales");
  const [loadedData, setData] = useState<ReportsData | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [exporting, setExporting] = useState(false),
    [exportError, setExportError] = useState("");
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
  // No branch means there is nothing to report on; asking anyway would only
  // produce a failure the reader cannot act on.
  const branchId = branch?.id ?? null;
  useEffect(() => {
    let cancelled = false;
    if (!branchId) return;
    getReports(request.from, request.to)
      .then((value) => {
        if (cancelled) return;
        if (value.range.branchId !== branchId)
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
  }, [request, branchId]);
  const data =
    branchId && loadedData?.range.branchId === branchId ? loadedData : null;
  const visible = useMemo(() => (data ? tables(data, tab) : []), [data, tab]);
  const section = tabs.find(([key]) => key === tab)?.[1] ?? "";
  if (!branch)
    return (
      <div className="grid place-items-center py-16 text-center">
        {branchError ? (
          // A failed load is not an answer, so it must not read as an account
          // with no branches: say what happened and let the reader try again.
          <>
            <p role="alert">{branchError}</p>
            <Button
              className="mt-4"
              onClick={() => void refreshBranches().catch(() => undefined)}
            >
              <RefreshCw className="size-4" />
              إعادة المحاولة
            </Button>
          </>
        ) : (
          <p className="text-muted">لا يوجد فرع لعرض تقاريره بعد.</p>
        )}
      </div>
    );
  // Print and Excel share one rule: only a finished report of this branch.
  const unavailable =
    !data || loading || Boolean(error) || data.range.branchId !== branch.id;
  const downloadExcel = async () => {
    if (!excelDownload || !data || unavailable) return;
    setExporting(true);
    setExportError("");
    try {
      await excelDownload({
        branchName: branch.name,
        from: data.range.from,
        to: data.range.to,
        section,
        tables: visible,
      });
    } catch {
      setExportError("تعذر تنزيل ملف Excel؛ حاول مرة أخرى.");
    } finally {
      setExporting(false);
    }
  };
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
                if (!unavailable) window.print();
              }}
              disabled={unavailable}
            >
              <Printer className="size-4" />
              طباعة / PDF
            </Button>
            {excelDownload && (
              <Button
                variant="secondary"
                aria-label="تنزيل Excel"
                onClick={downloadExcel}
                disabled={unavailable || exporting}
              >
                <FileSpreadsheet className="size-4" />
                Excel
              </Button>
            )}
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
            <h2 className="text-xl font-bold">{section}</h2>
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
        {exportError && (
          <ErrorBanner className="print-controls">{exportError}</ErrorBanner>
        )}
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
