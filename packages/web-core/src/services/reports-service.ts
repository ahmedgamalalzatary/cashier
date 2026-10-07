import { api } from "@cashier/web-core/lib/api";
export type ReportRow = Record<string, string | number | null>;
export type ReportsData = {
  range: { from: string; to: string; branchId: number; generatedAt: string };
  sales: Record<
    "byDay" | "byProduct" | "byCategory" | "byShift" | "byCashier",
    ReportRow[]
  >;
  stock: {
    current: ReportRow[];
    lowStock: ReportRow[];
    ledger: ReportRow[];
    stocktakes: ReportRow[];
  };
  money: {
    cashFlow: ReportRow[];
    expenseBreakdown: ReportRow[];
    expenses: ReportRow[];
    shiftOverShort: ReportRow[];
  };
  employees: {
    activity: ReportRow[];
    salaryHistory: ReportRow[];
    shiftHistory: ReportRow[];
  };
  operations: {
    transfers: ReportRow[];
    transferLines: ReportRow[];
    requests: ReportRow[];
    requestLines: ReportRow[];
    preparations: ReportRow[];
    ingredients: ReportRow[];
  };
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
    purchaseLines: ReportRow[];
  };
};
export type DashboardData = {
  summary: ReportRow | null;
  openShifts: ReportRow[];
  stock: ReportRow[];
};
export const getReports = (from: string, to: string) =>
  api<ReportsData>(
    `/api/reports?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
export const getReportsDashboard = () =>
  api<DashboardData>("/api/reports/dashboard");
