import type { Column } from "../../models/reports-model";
import { marginPercent } from "../../models/reports-model";
import type { ReportRow } from "../../services/reports-service";

type Options = Pick<Column, "filter" | "total">;
export const money = (key: string, label: string, options: Options = {}) => ({
  key,
  label,
  kind: "money" as const,
  ...options,
});
export const number = (key: string, label: string, options: Options = {}) => ({
  key,
  label,
  kind: "number" as const,
  ...options,
});
// An auto-closed shift has no counted drawer, so the cell says so instead of
// showing a zero that would read as "balanced".
export const uncountedMoney = (key: string, label: string) => ({
  key,
  label,
  kind: "uncountedMoney" as const,
});
export const date = (key: string, label: string) => ({
  key,
  label,
  kind: "date" as const,
});
// A document ID: its own number or a short code, linked where a page exists.
export const reference = (
  key: string,
  label: string,
  options: Pick<Column, "document" | "documentKey" | "labelKey"> = {},
) => ({ key, label, kind: "reference" as const, ...options });
export const text = (key: string, label: string, options: Options = {}) => ({
  key,
  label,
  ...options,
});
export const warehouse = (key = "warehouse") => ({
  key,
  label: "المخزن",
  kind: "warehouse" as const,
  filter: true as const,
});
export const event = (
  key: string,
  label: string,
  labelSet: Column["labelSet"],
  options: Options = { filter: true },
) => ({ key, label, kind: "event" as const, labelSet, ...options });
export const margin = { key: "margin", label: "هامش الربح %", kind: "percent" as const };

/** Rows with their gross profit margin on net sales. */
export const withMargin = (rows: ReportRow[]) =>
  rows.map((row) => ({
    ...row,
    margin: marginPercent(
      Number(row.profit ?? 0),
      Number(row.sales ?? 0) - Number(row.refunds ?? 0),
    ),
  }));
