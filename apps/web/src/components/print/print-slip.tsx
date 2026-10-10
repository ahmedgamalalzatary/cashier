"use client";

import { Fragment, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Hidden on screen. While printing, globals.css hides every other part of the
 * page, so a long page behind the slip does not feed blank receipt paper.
 */
export function PrintSlip({ children }: { children: ReactNode }) {
  // The prerendered HTML has no document; the browser always does.
  const inBrowser = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
  return inBrowser
    ? createPortal(<div className="print-slip">{children}</div>, document.body)
    : null;
}

const noSubscription = () => () => {};

export const slipQuantity = (value: string) =>
  Number(value).toLocaleString("ar-EG", { maximumFractionDigits: 3 });

/** The 80mm receipt page the POS receipt also uses. */
export function Slip({
  title,
  label,
  children,
}: {
  title: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <article
      className="receipt-print-root mx-auto w-full max-w-[80mm] bg-white px-5 py-6 text-ink"
      aria-label={label}
    >
      <header className="border-b-2 border-dotted border-ink/30 pb-4 text-center">
        <p className="text-2xl font-bold">الكافيه</p>
        <p className="mt-1 text-xs">{title}</p>
      </header>
      {children}
    </article>
  );
}

/** Facts without a value (no phone, no note…) are left off the slip. */
export function SlipFacts({
  facts,
}: {
  facts: Array<[label: string, value: ReactNode]>;
}) {
  return (
    <dl className="my-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
      {facts.filter(([, value]) => value != null && value !== false && value !== "").map(([label, value]) => (
        <Fragment key={label}>
          <dt className="text-muted">{label}</dt>
          <dd className="text-left">{value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

export function SlipTotals({
  totals,
}: {
  /** `false` leaves a total off, e.g. a discount of zero. */
  totals: Array<[label: string, value: string, strong?: boolean] | false>;
}) {
  return (
    <dl className="mt-3 space-y-1 border-t-2 border-dotted border-ink/30 pt-3 text-sm">
      {totals.filter((total) => total !== false).map(([label, value, strong]) => (
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

export function SlipNote({ label, text }: { label: string; text: string }) {
  return (
    <p className="mt-4 border-t border-dotted border-ink/30 pt-3 text-xs">
      <span className="text-muted">{label}: </span>
      {text}
    </p>
  );
}
