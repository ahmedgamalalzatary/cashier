"use client";
import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, Printer, RefreshCw } from "lucide-react";
import { ReportTable } from "../components/reports/report-table";
import { Button } from "../components/ui/button";
import { PageHeader } from "../components/ui/page-header";
import { TabPanel, Tabs } from "../components/ui/tabs";
import { ErrorBanner, LoadingState } from "../components/ui/states";
import { cairoCalendarDate, cairoCalendarLabel } from "../lib/cairo-date";
import type {
  DocumentHref,
  ReportPreset,
  ReportTable as TableData,
  TableView,
} from "../models/reports-model";
import {
  isReportRangeReady,
  presetRange,
  shownTables,
} from "../models/reports-model";
import { getReports, type ReportsData } from "../services/reports-service";
import { useBranch } from "../components/branches/branch-provider";
import { ReportOverview } from "./reports/report-overview";
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

const presets: [ReportPreset, string][] = [
  ["today", "اليوم"],
  ["yesterday", "أمس"],
  ["week", "هذا الأسبوع"],
  ["month", "هذا الشهر"],
  ["lastMonth", "الشهر الماضي"],
  ["custom", "مخصص"],
];

/** The loaded period in Arabic, earliest date first. */
export function periodText(from: string, to: string) {
  return from === to
    ? cairoCalendarLabel(from)
    : `من ${cairoCalendarLabel(from)} إلى ${cairoCalendarLabel(to)}`;
}

export function ReportsPage({
  excelDownload,
  documentHref,
}: {
  /** Only the online site passes this; the desktop keeps print/PDF only. */
  excelDownload?: (report: ReportExport) => Promise<void>;
  /** Only the desktop passes this: it has the document pages to open. */
  documentHref?: DocumentHref;
} = {}) {
  const today = cairoCalendarDate(),
    month = presetRange("month", today);
  const { branch, error: branchError, refresh: refreshBranches } = useBranch();
  const [preset, setPreset] = useState<ReportPreset>("month"),
    [from, setFrom] = useState(month.from),
    [to, setTo] = useState(month.to),
    [tab, setTab] = useState<Tab>("overview");
  const [loadedData, setData] = useState<ReportsData | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [exporting, setExporting] = useState(false),
    [exportError, setExportError] = useState("");
  const [views, setViews] = useState<Record<string, TableView>>({});
  const [request, setRequest] = useState({
    from: month.from,
    to: month.to,
    revision: 0,
  });
  // Any change of dates reloads at once; there is no separate refresh step.
  const load = (start: string, end: string) => {
    setFrom(start);
    setTo(end);
    if (!isReportRangeReady(start, end)) return;
    setLoading(true);
    setError("");
    setData(null);
    setRequest({ from: start, to: end, revision: request.revision + 1 });
  };
  const choosePreset = (next: ReportPreset) => {
    setPreset(next);
    if (next === "custom") return;
    const range = presetRange(next, today);
    load(range.from, range.to);
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
  // What is on screen after each table's search, filters and sort; print and
  // the Excel download use exactly these rows.
  const raw = useMemo(() => (data ? tables(data, tab) : []), [data, tab]);
  const visible = useMemo(() => shownTables(raw, views), [raw, views]);
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
  const onView = (title: string, view: TableView) =>
    setViews((current) => ({ ...current, [title]: view }));
  return (
    <div className="report-print-root space-y-6">
      <PageHeader
        title="التقارير"
        actions={
          <div className="print-controls flex gap-2">
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
      <div className="print-controls space-y-3">
        <div
          role="group"
          aria-label="الفترة"
          className="flex flex-wrap gap-2"
        >
          {presets.map(([id, label]) => (
            <Button
              key={id}
              variant={preset === id ? "primary" : "secondary"}
              aria-pressed={preset === id}
              data-preset={id}
              onClick={() => choosePreset(id)}
            >
              {label}
            </Button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="toolbar">
            <label className="block space-y-1.5 text-sm">
              <span className="font-medium">من</span>
              <input
                aria-label="من"
                type="date"
                value={from}
                max={to}
                onChange={(e) => load(e.target.value, to)}
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
                onChange={(e) => load(from, e.target.value)}
                className="input"
              />
            </label>
          </div>
        )}
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
          <div className="mb-6 space-y-1 rounded-xl border border-line bg-surface p-4 print:border-0 print:p-0">
            <h2 className="text-xl font-bold">{section}</h2>
            <p>{branch.name}</p>
            <p>الفترة: {periodText(data.range.from, data.range.to)}</p>
            <p className="text-xs text-muted">
              توقيت القاهرة · وقت التحميل:{" "}
              {new Date(data.range.generatedAt).toLocaleString("ar-EG", {
                timeZone: "Africa/Cairo",
              })}
            </p>
          </div>
        )}
        {error && (
          <ErrorBanner>
            {error}{" "}
            <button
              type="button"
              className="print-controls font-semibold underline"
              onClick={() => load(from, to)}
            >
              إعادة المحاولة
            </button>
          </ErrorBanner>
        )}
        {exportError && (
          <ErrorBanner className="print-controls">{exportError}</ErrorBanner>
        )}
        {loading ? (
          <LoadingState label="جارِ تحميل التقرير…" />
        ) : data && tab === "overview" ? (
          <ReportOverview data={data} onOpenTab={setTab} />
        ) : (
          <div className="space-y-8">
            {raw.map((table) => (
              <ReportTable
                key={table.title}
                {...table}
                views={views}
                onView={onView}
                documentHref={documentHref}
              />
            ))}
          </div>
        )}
      </TabPanel>
    </div>
  );
}
