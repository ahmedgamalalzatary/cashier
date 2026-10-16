import { matchesQuery } from "../lib/search";
import type { ReportRow } from "../services/reports-service";
import { reportCellText } from "./report-cell";
/** A document a reference cell can open, where the site has a page for it. */
export type ReportDocument =
  | "order"
  | "refund"
  | "purchase"
  | "transfer"
  | "preparation";
/** Only the desktop passes this; the online site has no document pages. */
export type DocumentHref = (document: ReportDocument, id: string) => string;
export type Column = {
  key: string;
  label: string;
  kind?:
    | "money"
    | // money that may be absent because the drawer was never counted
      "uncountedMoney"
    | "date"
    | "number"
    | "warehouse"
    | "event"
    // a document ID: shown as its number (labelKey) or a short code, never raw
    | "reference"
    // worked minutes, shown as hours and minutes
    | "minutes"
    | "percent";
  // Selects which code vocabulary an `event` column decodes. Columns that
  // print the same code for different things (a stocktake reference vs a
  // stocktake document kind) need distinct sets.
  labelSet?:
    | "movement"
    | "reference"
    | "cashFlow"
    | "stocktakeKind"
    | "salaryHistory"
    | "wasteReason"
    | "status"
    | "shiftAction"
    | "expenseType";
  /** reference: the row key holding the document's own number. */
  labelKey?: string;
  /** reference: the document every row of this column opens. */
  document?: ReportDocument;
  /** reference: the row key whose type code names the document (ledgers). */
  documentKey?: string;
  /** Offer a filter of this column's values (warehouse, cashier, type…). */
  filter?: true;
  /** Add this column up in the totals row. */
  total?: true;
};
export type ReportTable = {
  title: string;
  rows: ReportRow[];
  columns: Column[];
  note?: string;
  /** The raw ledger behind this summary, collapsed under it. */
  details?: ReportTable;
};
export function reportTotal(rows: ReportRow[], key: string) {
  return rows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0);
}
export function isReportRangeReady(from: string, to: string) {
  return from !== "" && to !== "" && from <= to;
}

const documentTypes: Record<string, ReportDocument> = {
  order: "order",
  sale: "order",
  refund: "refund",
  purchase_invoice: "purchase",
  transfer: "transfer",
  preparation: "preparation",
};

/** The document a reference cell opens, if any. */
export function referenceDocument(row: ReportRow, column: Column) {
  if (column.document) return column.document;
  const type = column.documentKey ? row[column.documentKey] : null;
  return type == null ? undefined : documentTypes[String(type)];
}

export type ReportPreset =
  | "today"
  | "yesterday"
  | "week"
  | "month"
  | "lastMonth"
  | "custom";

const shiftDays = (day: string, days: number) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** The Cairo calendar range a preset covers, given today's Cairo date. */
export function presetRange(
  preset: Exclude<ReportPreset, "custom">,
  today: string,
) {
  if (preset === "today") return { from: today, to: today };
  if (preset === "yesterday") {
    const day = shiftDays(today, -1);
    return { from: day, to: day };
  }
  if (preset === "week") {
    // The shop's week starts on Saturday (owner decision 2026-10-15).
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
    return { from: shiftDays(today, -((weekday + 1) % 7)), to: today };
  }
  const monthStart = `${today.slice(0, 7)}-01`;
  if (preset === "month") return { from: monthStart, to: today };
  const lastMonthEnd = shiftDays(monthStart, -1);
  return { from: `${lastMonthEnd.slice(0, 7)}-01`, to: lastMonthEnd };
}

/** What the reader did to one table: search, sort and filters. */
export type TableView = {
  search: string;
  sort?: { key: string; direction: "asc" | "desc" };
  filters: Record<string, string>;
};
export const emptyTableView: TableView = { search: "", filters: {} };

/** Kinds that hold figures: sorted as numbers, never searched. */
export const numericKinds = new Set<Column["kind"]>([
  "money",
  "uncountedMoney",
  "number",
  "minutes",
  "percent",
]);
const textKinds = new Set<Column["kind"]>([
  undefined,
  "event",
  "warehouse",
  "reference",
]);
const collator = new Intl.Collator("ar", { numeric: true });
const isBlank = (value: unknown) => value == null || value === "";

function compareRows(a: ReportRow, b: ReportRow, column: Column) {
  const left = a[column.key],
    right = b[column.key];
  if (numericKinds.has(column.kind)) return Number(left) - Number(right);
  // ISO dates and timestamps already sort as text.
  if (column.kind === "date") return String(left).localeCompare(String(right));
  return collator.compare(reportCellText(a, column), reportCellText(b, column));
}

/** The rows a table shows after the reader's search, filters and sort. */
export function applyTableView(
  rows: ReportRow[],
  columns: Column[],
  view: TableView,
) {
  const searched = columns.filter((column) => textKinds.has(column.kind));
  let shown = rows.filter(
    (row) =>
      Object.entries(view.filters).every(
        ([key, value]) => !value || String(row[key] ?? "") === value,
      ) &&
      matchesQuery(
        view.search,
        ...searched.map((column) => reportCellText(row, column)),
      ),
  );
  const column = view.sort && columns.find((c) => c.key === view.sort!.key);
  if (column) {
    const sign = view.sort!.direction === "asc" ? 1 : -1;
    shown = [...shown].sort((a, b) => {
      // An empty cell stays last whichever way the column is sorted.
      const blankA = isBlank(a[column.key]),
        blankB = isBlank(b[column.key]);
      if (blankA || blankB) return Number(blankA) - Number(blankB);
      return sign * compareRows(a, b, column);
    });
  }
  return shown;
}

/** The tables as the reader sees them: every view applied, details too. */
export function shownTables(
  tables: ReportTable[],
  views: Record<string, TableView>,
): ReportTable[] {
  return tables.map((table) => ({
    ...table,
    rows: applyTableView(
      table.rows,
      table.columns,
      views[table.title] ?? emptyTableView,
    ),
    ...(table.details && {
      details: shownTables([table.details], views)[0],
    }),
  }));
}

/** Each value of a filter column once, with the label the table shows. */
export function filterOptions(rows: ReportRow[], column: Column) {
  const options = new Map<string, string>();
  for (const row of rows) {
    const value = row[column.key];
    if (isBlank(value) || options.has(String(value))) continue;
    options.set(String(value), reportCellText(row, column));
  }
  return [...options].map(([value, label]) => ({ value, label }));
}

/** Sums of the columns marked for the totals row. */
export function tableTotals(rows: ReportRow[], columns: Column[]) {
  return Object.fromEntries(
    columns
      .filter((column) => column.total)
      .map((column) => [
        column.key,
        Math.round(reportTotal(rows, column.key) * 1000) / 1000,
      ]),
  );
}

/** Change against the previous period in %, or null with nothing to compare. */
export function percentChange(current: number, previous: number) {
  if (!previous) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

/** Gross profit as a share of net sales, or null without net sales. */
export function marginPercent(profit: number, netSales: number) {
  return netSales > 0 ? Math.round((profit / netSales) * 1000) / 10 : null;
}
