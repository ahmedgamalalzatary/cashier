import type { ReportRow } from "@/services/reports-service";
export type Column = {
  key: string;
  label: string;
  kind?: "money" | "date" | "number" | "warehouse" | "event";
};
export type ReportTable = {
  title: string;
  rows: ReportRow[];
  columns: Column[];
};
export function reportTotal(rows: ReportRow[], key: string) {
  return rows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0);
}
