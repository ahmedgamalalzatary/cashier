"use client";

import type { ReactNode } from "react";
import { CashierShiftControls } from "../shifts/cashier-shift-controls";
import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import type { CurrentShift, Role, Shift } from "@cashier/shared";
import { cairoClock } from "@cashier/web-core/lib/cairo-date";
import {
  countPhrase,
  dayTape,
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
  onChanged?: (current: Shift | null) => void;
};

/**
 * The day printed the way the shop already reads it — as a receipt. The lines
 * feed in on load like paper leaving the printer.
 */
export function ShiftTape({ role, current, shifts, onChanged }: Props) {
  const shift = openShiftOf(current);
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
                {role === "cashier" ? "الدرج مقفول" : "سجل الورديات"}
              </span>
              <h2 id="tape-heading" className="mt-2 text-xl font-bold">
                {role === "cashier" ? "لا توجد وردية مفتوحة" : "ورديات الفرع"}
              </h2>
              <p className="mt-1 text-xs leading-5 text-muted">
                {role === "cashier"
                  ? "افتح ورديتك وأدخل العهدة المعدودة قبل أول طلب."
                  : "تابع كل الورديات المفتوحة من ملخص الإدارة وصفحة الورديات."}
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

        <Feed step={step++}>
          <div className="mt-6">
            {role === "cashier" ? (
              <CashierShiftControls
                current={shift}
                onChanged={onChanged ?? (() => undefined)}
              />
            ) : (
              <Link href="/shifts" className="text-sm font-medium text-primary">
                سجل الورديات وإدارتها
              </Link>
            )}
          </div>
        </Feed>
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
