import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import type {
  Column,
  DocumentHref,
  ReportTable as ReportTableData,
  TableView,
} from "../../models/reports-model";
import {
  applyTableView,
  emptyTableView,
  filterOptions,
  numericKinds,
  referenceDocument,
  tableTotals,
} from "../../models/reports-model";
import { reportCellText } from "../../models/report-cell";
import type { ReportRow } from "../../services/reports-service";
export { reportCellText } from "../../models/report-cell";

const count = new Intl.NumberFormat("ar-EG");

function Cell({
  row,
  column,
  documentHref,
}: {
  row: ReportRow;
  column: Column;
  documentHref?: DocumentHref;
}) {
  const text = reportCellText(row, column),
    id = row[column.key],
    document =
      column.kind === "reference" ? referenceDocument(row, column) : undefined;
  if (!documentHref || !document || id == null || id === "") return <>{text}</>;
  return (
    <Link
      href={documentHref(document, String(id))}
      className="font-medium text-primary underline-offset-2 hover:underline"
    >
      {text}
    </Link>
  );
}

function SortHeader({
  column,
  view,
  onSort,
}: {
  column: Column;
  view: TableView;
  onSort: () => void;
}) {
  const direction = view.sort?.key === column.key ? view.sort.direction : null;
  const Icon =
    direction === "asc" ? ArrowUp : direction === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <th
      scope="col"
      aria-sort={
        direction === "asc"
          ? "ascending"
          : direction === "desc"
            ? "descending"
            : undefined
      }
      className="px-4 py-2.5 text-start text-xs font-semibold text-muted"
    >
      <button
        type="button"
        data-sort={column.key}
        onClick={onSort}
        className="inline-flex items-center gap-1 hover:text-ink"
      >
        {column.label}
        <Icon
          className={`print-controls size-3 ${direction ? "" : "opacity-40"}`}
          aria-hidden
        />
      </button>
    </th>
  );
}

/**
 * One report table with its search, sort, filters and totals. It keeps no
 * state: the page owns every table's view, so print and the Excel download
 * output exactly the rows on screen.
 */
export function ReportTable({
  title,
  rows,
  columns,
  note,
  details,
  views = {},
  onView,
  documentHref,
}: ReportTableData & {
  views?: Record<string, TableView>;
  onView?: (title: string, view: TableView) => void;
  documentHref?: DocumentHref;
}) {
  const view = views[title] ?? emptyTableView,
    shown = applyTableView(rows, columns, view),
    totals = tableTotals(shown, columns),
    filters = columns.filter((column) => column.filter),
    change = (next: Partial<TableView>) => onView?.(title, { ...view, ...next });
  const sortBy = (key: string) =>
    change({
      sort: {
        key,
        direction:
          view.sort?.key === key && view.sort.direction === "asc" ? "desc" : "asc",
      },
    });
  return (
    <section className="break-inside-avoid space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-bold">{title}</h2>
        <span className="text-xs text-muted">
          {shown.length === rows.length
            ? `${count.format(rows.length)} سجل`
            : `${count.format(shown.length)} من ${count.format(rows.length)} سجل`}
        </span>
      </div>
      {note && <p className="text-sm text-muted">{note}</p>}
      {rows.length > 0 && (
        <div className="print-controls flex flex-wrap items-end gap-2">
          <label className="relative min-w-48 flex-1">
            <span className="sr-only">بحث في {title}</span>
            <Search
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted"
              aria-hidden
            />
            <input
              type="search"
              value={view.search}
              placeholder="بحث…"
              onChange={(e) => change({ search: e.target.value })}
              className="input ps-9"
            />
          </label>
          {filters.map((column) => (
            <label key={column.key} className="text-sm">
              <span className="sr-only">{column.label}</span>
              <select
                className="input"
                value={view.filters[column.key] ?? ""}
                onChange={(e) =>
                  change({
                    filters: { ...view.filters, [column.key]: e.target.value },
                  })
                }
              >
                <option value="">كل {column.label}</option>
                {filterOptions(rows, column).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}
      {shown.length ? (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="border-b border-line bg-paper/50">
                {columns.map((column) => (
                  <SortHeader
                    key={column.key}
                    column={column}
                    view={view}
                    onSort={() => sortBy(column.key)}
                  />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map((row, index) => (
                <tr key={`${title}-${index}`}>
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-4 py-2.5 ${numericKinds.has(column.kind) ? "tnum" : ""}`}
                    >
                      <Cell
                        row={row}
                        column={column}
                        documentHref={documentHref}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {Object.keys(totals).length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-line bg-paper/50 font-bold">
                  {columns.map((column, index) => (
                    <td key={column.key} className="tnum px-4 py-2.5">
                      {column.key in totals
                        ? reportCellText(totals, column)
                        : index === 0
                          ? "الإجمالي"
                          : ""}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      ) : (
        <p className="empty-state text-sm text-muted">
          {rows.length ? "لا توجد نتائج مطابقة" : "لا توجد بيانات"}
        </p>
      )}
      {details && (
        <details className="rounded-xl border border-line p-3">
          <summary className="cursor-pointer text-sm font-semibold">
            التفاصيل: {details.title}
          </summary>
          <div className="mt-3">
            <ReportTable
              {...details}
              views={views}
              onView={onView}
              documentHref={documentHref}
            />
          </div>
        </details>
      )}
    </section>
  );
}
