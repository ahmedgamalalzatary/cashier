import { Fragment, type ReactNode } from "react";
import { cairoCalendarLabel } from "@cashier/web-core/lib/cairo-date";

export type A4Fact = [label: string, value: ReactNode];

/**
 * One layout for every filed A4 document (spec §2 "Paper size rule"): shop
 * name, document title, facts, a table, totals and optional signature lines.
 * Visible only while printing, because it lives inside `PrintSlip`.
 */
export function A4Document({
  title,
  label,
  facts,
  totals,
  signatures,
  children,
}: {
  title: string;
  label: string;
  facts?: A4Fact[];
  /** `false` leaves a total off, e.g. a discount of zero. */
  totals?: Array<[label: string, value: string, strong?: boolean] | false>;
  signatures?: string[];
  children?: ReactNode;
}) {
  return (
    <article
      className="a4-print-root mx-auto w-full max-w-[210mm] bg-white px-2 py-1 text-ink"
      aria-label={label}
    >
      <header className="mb-4 border-b-2 border-ink/40 pb-3 text-center">
        <p className="text-2xl font-bold">الكافيه</p>
        <p className="mt-1 text-sm font-medium">{title}</p>
        <p className="tnum mt-1 text-xs text-muted">{cairoCalendarLabel()}</p>
      </header>
      {facts && <A4Facts facts={facts} />}
      {children}
      {totals && <A4Totals totals={totals} />}
      {signatures && <A4Signatures lines={signatures} />}
    </article>
  );
}

/** Facts without a value (no phone, no note…) are left off the document. */
export function A4Facts({ facts }: { facts: A4Fact[] }) {
  return (
    <dl className="my-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      {facts
        .filter(([, value]) => value != null && value !== false && value !== "")
        .map(([label, value]) => (
          <Fragment key={label}>
            <dt className="text-muted">{label}</dt>
            <dd className="text-left">{value}</dd>
          </Fragment>
        ))}
    </dl>
  );
}

export function A4Totals({
  totals,
}: {
  totals: Array<[label: string, value: string, strong?: boolean] | false>;
}) {
  return (
    <dl className="ms-auto mt-4 max-w-xs space-y-1.5 border-t-2 border-ink/40 pt-3 text-sm">
      {totals
        .filter((total) => total !== false)
        .map(([label, value, strong]) => (
          <div
            key={label}
            className={`flex items-baseline justify-between gap-4 ${
              strong ? "text-base font-bold" : ""
            }`}
          >
            <dt>{label}</dt>
            <dd className="tnum">{value}</dd>
          </div>
        ))}
    </dl>
  );
}

export function A4Signatures({ lines }: { lines: string[] }) {
  return (
    <div className="mt-10 grid grid-cols-2 gap-8 text-sm text-muted">
      {lines.map((label) => (
        <p key={label}>
          {label}
          <span className="mt-10 block border-b border-ink/60" />
        </p>
      ))}
    </div>
  );
}
