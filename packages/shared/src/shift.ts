import { MAX_SHIFT_HOURS, SHIFT_WARNING_MINUTES } from "./types.js";

export type ShiftAutoCloseWarning = {
  /** Minutes left before the system closes the shift; 0 once it is overdue. */
  remainingMinutes: number;
  text: string;
};

/**
 * Warns the cashier before the system closes a forgotten shift. Returns null
 * while the shift is young, closed, or absent, so the caller can render the
 * banner only when there is something to say.
 */
export function shiftAutoCloseWarning(
  shift:
    | { status: string; workedMinutes: number; currentSegmentMinutes?: number }
    | null
    | undefined,
): ShiftAutoCloseWarning | null {
  if (!shift || shift.status !== "open") return null;
  const remainingMinutes =
    MAX_SHIFT_HOURS * 60 - (shift.currentSegmentMinutes ?? shift.workedMinutes);
  if (remainingMinutes > SHIFT_WARNING_MINUTES) return null;
  const left = Math.max(0, remainingMinutes);
  if (left === 0)
    return {
      remainingMinutes: 0,
      text: "بلغت ورديتك الحد الأقصى وستُغلق تلقائياً دون عدّ الدرج — أغلقها وعدّ الدرج الآن",
    };
  const hours = Math.floor(left / 60);
  const minutes = left % 60;
  const countdown =
    hours > 0
      ? `خلال ${hours} ساعة${minutes ? ` و${minutes} دقيقة` : ""}`
      : `خلال ${minutes} دقيقة`;
  return {
    remainingMinutes: left,
    text: `ستُغلق ورديتك تلقائياً ${countdown} دون عدّ الدرج — أغلقها وعدّ الدرج الآن`,
  };
}
