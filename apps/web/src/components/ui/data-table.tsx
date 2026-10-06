import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type DataColumn<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Tabular figures, aligned to the row end. */
  numeric?: boolean;
  /** "primary" becomes the mobile row title; "hidden" drops it on mobile. */
  mobile?: "primary" | "hidden";
  className?: string;
};

/**
 * The single data-list pattern: a table from md up, ruled row cards below,
 * both fed by the same columns. Every dataset gets a mobile layout for free.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowClassName,
  actions,
  empty,
  caption,
}: {
  columns: ReadonlyArray<DataColumn<T>>;
  rows: ReadonlyArray<T>;
  rowKey: (row: T, index: number) => string | number;
  rowClassName?: (row: T) => string | undefined;
  actions?: (row: T) => ReactNode;
  empty?: ReactNode;
  caption?: string;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;

  const primary =
    columns.find((column) => column.mobile === "primary") ??
    columns.find((column) => column.mobile !== "hidden");
  const meta = columns.filter(
    (column) => column !== primary && column.mobile !== "hidden",
  );

  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border border-line bg-surface md:block">
        <table className="w-full text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="border-b border-line bg-paper/50">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    "px-4 py-2.5 text-xs font-semibold text-muted",
                    column.numeric ? "text-end" : "text-start",
                    column.className,
                  )}
                >
                  {column.header}
                </th>
              ))}
              {actions && (
                <th scope="col" className="px-4 py-2.5">
                  <span className="sr-only">إجراءات</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((row, index) => (
              <tr
                key={rowKey(row, index)}
                className={cn(
                  "transition-colors hover:bg-paper/60",
                  rowClassName?.(row),
                )}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      "px-4 py-3",
                      column.numeric && "tnum text-end",
                      column.className,
                    )}
                  >
                    {column.cell(row)}
                  </td>
                ))}
                {actions && (
                  <td className="px-4 py-3 text-end">{actions(row)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-2 md:hidden">
        {rows.map((row, index) => (
          <li
            key={rowKey(row, index)}
            className={cn("sheet p-4", rowClassName?.(row))}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">{primary?.cell(row)}</div>
              {actions && <div className="shrink-0">{actions(row)}</div>}
            </div>
            {meta.length > 0 && (
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-line pt-3 text-xs">
                {meta.map((column) => (
                  <div key={column.key}>
                    <dt className="text-muted">{column.header}</dt>
                    <dd className={cn("mt-0.5", column.numeric && "tnum")}>
                      {column.cell(row)}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
