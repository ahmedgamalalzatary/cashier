import { api } from "@/lib/api";
export type ReportRow = Record<string, string | number | null>;
export type ReportsData = {
  range: { from: string; to: string };
  sales: Record<
    "byDay" | "byProduct" | "byCategory" | "byShift" | "byCashier",
    ReportRow[]
  >;
  stock: { current: ReportRow[]; lowStock: ReportRow[]; ledger: ReportRow[] };
  money: {
    cashFlow: ReportRow[];
    expenseBreakdown: ReportRow[];
    shiftOverShort: ReportRow[];
  };
  employees: ReportRow[];
  wasteAndRefunds: {
    waste: ReportRow[];
    wasteSummary: ReportRow[];
    refunds: ReportRow[];
    refundSummary: ReportRow[];
  };
  suppliers: {
    summary: ReportRow[];
    purchases: ReportRow[];
    payments: ReportRow[];
  };
};
export type DashboardData = {
  summary: ReportRow | null;
  openShift: ReportRow | null;
  stock: ReportRow[];
};
export const getReports = (from: string, to: string) =>
  api<ReportsData>(
    `/api/reports?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
export const getReportsDashboard = () =>
  api<DashboardData>("/api/reports/dashboard");
