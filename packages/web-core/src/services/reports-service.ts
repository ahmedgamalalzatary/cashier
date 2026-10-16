import { api } from "@cashier/web-core/lib/api";
export type ReportRow = Record<string, string | number | null>;
/** Headline figures of one period (see the API's periodFigures). */
export type PeriodFigures = {
  sales: number;
  refunds: number;
  netSales: number;
  ordersCount: number;
  averageOrder: number;
  cost: number;
  returnedCost: number;
  grossProfit: number;
  /** Gross profit as % of net sales; null without net sales. */
  margin: number | null;
  expenses: number;
  wasteCost: number;
  /** Salary payments and advances paid in the period. */
  salaries: number;
  netProfit: number;
};
export type TopProduct = {
  productName: string;
  sizeName: string | null;
  value: number;
};
export type ReportOverview = {
  current: PeriodFigures;
  previous: PeriodFigures & { from: string; to: string };
  byHour: { hour: number; sales: number; ordersCount: number }[];
  topBySales: TopProduct[];
  topByProfit: TopProduct[];
  alerts: { lowStock: number; negativeStock: number; overShort: number };
};
export type ReportsData = {
  range: { from: string; to: string; branchId: string; generatedAt: string };
  overview: ReportOverview;
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
