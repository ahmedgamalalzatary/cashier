import type { ReportRow } from "@/services/reports-service";
export type Column = {
  key: string;
  label: string;
  kind?: "money" | "date" | "number" | "warehouse" | "event";
  // Selects which code vocabulary an `event` column decodes. Columns that
  // print the same code for different things (a stocktake reference vs a
  // stocktake document kind) need distinct sets.
  labelSet?:
    | "movement"
    | "reference"
    | "cashFlow"
    | "stocktakeKind"
    | "salaryHistory"
    | "wasteReason";
};
export type ReportTable = {
  title: string;
  rows: ReportRow[];
  columns: Column[];
};
export function reportTotal(rows: ReportRow[], key: string) {
  return rows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0);
}
export function isReportRangeReady(from: string, to: string) {
  return from !== "" && to !== "" && from <= to;
}
