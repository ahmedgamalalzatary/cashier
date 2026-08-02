"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { LockKeyhole, UnlockKeyhole } from "lucide-react";
import type { CurrentShift, Role, Shift } from "@cashier/shared";
import { cairoClock } from "@/lib/cairo-date";
import {
  countPhrase,
  dayTape,
  drawerIsBusy,
  openShiftOf,
  SHIFT_COUNT,
  shiftTapeLines,
  workedLabel,
  type TapeLine,
} from "@/models/home-model";

type Props = {
  role: Role;
  current: CurrentShift | null;
  shifts: Shift[];
};

/**
 * The day printed the way the shop already reads it — as a receipt. The lines
 * feed in on load like paper leaving the printer.
 */
export function ShiftTape({ role, current, shifts }: Props) {
  const shift = openShiftOf(current);
  const busy = drawerIsBusy(current);
  const day = dayTape(shifts);
  let step = 0;

  return (
    <section className="tape" aria-labelledby="tape-heading">
      <div className="tape-top" aria-hidden="true" />
      <div className="bg-surface px-6 pb-7 pt-2">
        <Feed step={step++}>
          {shift ? (
            <>
              <span className="inline-flex items-center gap-2 text-xs font-medium text-success">
                <span className="tape-live size-1.5 rounded-full bg-success" />
                وردية مفتوحة
                <span className="text-muted tnum">#{shift.id}</span>
              </span>
              <h2 id="tape-heading" className="mt-2 text-xl font-bold">
                {shift.cashierName}
              </h2>
              {/* "مضى" keeps the separator between two letters — against a
                  digit it would read as part of the number. */}
              <p className="mt-1 text-xs text-muted">
                فُتحت {cairoClock(new Date(shift.openedAt))} · مضى{" "}
                {workedLabel(shift.workedMinutes)}
              </p>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-2 text-xs font-medium text-muted">
                <LockKeyhole className="size-3.5" />
                الدرج مقفول
              </span>
              <h2 id="tape-heading" className="mt-2 text-xl font-bold">
                {busy ? "الدرج مع كاشير آخر" : "لا توجد وردية مفتوحة"}
              </h2>
              <p className="mt-1 text-xs leading-5 text-muted">
                {busy
                  ? "تفاصيل النقدية تظهر لصاحب الوردية فقط، ولا يمكن فتح وردية جديدة حتى تُغلق."
                  : role === "cashier"
                    ? "افتح ورديتك وأدخل العهدة المعدودة قبل أول طلب."
                    : "الكاشير يفتح الوردية من صفحة الورديات."}
              </p>
            </>
          )}
        </Feed>

        {shift && (
          <>
            <Rule step={step++} />
            <dl className="space-y-2.5">
              {shiftTapeLines(shift).map((line) => (
                <Feed key={line.label} step={step++}>
                  <Row line={line} />
                </Feed>
              ))}
            </dl>
          </>
        )}

        <Rule step={step++} dashed />
        <Feed step={step++}>
          <p className="text-xs font-medium text-muted">
            {role === "cashier" ? "يومك" : "اليوم"}
            {day.shiftCount > 0 && (
              <span> · {countPhrase(day.shiftCount, SHIFT_COUNT)}</span>
            )}
          </p>
        </Feed>
        {day.shiftCount === 0 ? (
          <Feed step={step++}>
            <p className="mt-2 text-xs text-muted">لم تبدأ ورديات اليوم بعد.</p>
          </Feed>
        ) : (
          <dl className="mt-3 space-y-2.5">
            {day.lines.map((line) => (
              <Feed key={line.label} step={step++}>
                <Row line={line} />
              </Feed>
            ))}
          </dl>
        )}

        {!busy && (
          <Feed step={step++}>
            <Link
              href="/shifts"
              className={`mt-6 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                shift
                  ? "border border-line text-ink hover:bg-line/50"
                  : "bg-primary text-white hover:bg-primary-strong"
              }`}
            >
              {shift ? (
                <>
                  <LockKeyhole className="size-4" />
                  {role === "cashier" ? "إغلاق وعدّ الدرج" : "متابعة الوردية"}
                </>
              ) : (
                <>
                  <UnlockKeyhole className="size-4" />
                  {role === "cashier" ? "فتح وردية" : "سجل الورديات"}
                </>
              )}
            </Link>
          </Feed>
        )}
      </div>
      <div className="tape-bottom" aria-hidden="true" />
    </section>
  );
}

function Row({ line }: { line: TapeLine }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-[13px] text-muted">{line.label}</dt>
      <span className="tape-leader" aria-hidden="true" />
      <dd className="text-[13px] font-medium tnum">{line.value}</dd>
    </div>
  );
}

function Rule({ step, dashed = false }: { step: number; dashed?: boolean }) {
  return (
    <Feed step={step}>
      <div
        className={`my-5 border-t border-line ${dashed ? "border-dashed" : "border-dotted"}`}
      />
    </Feed>
  );
}

function Feed({ step, children }: { step: number; children: ReactNode }) {
  return (
    <div className="tape-line" style={{ animationDelay: `${step * 45}ms` }}>
      {children}
    </div>
  );
}
