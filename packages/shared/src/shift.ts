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
  shift: { status: string; workedMinutes: number } | null | undefined,
): ShiftAutoCloseWarning | null {
  if (!shift || shift.status !== "open") return null;
  const remainingMinutes = MAX_SHIFT_HOURS * 60 - shift.workedMinutes;
  if (remainingMinutes > SHIFT_WARNING_MINUTES) return null;
  const left = Math.max(0, remainingMinutes);
  const hours = Math.floor(left / 60);
  const minutes = left % 60;
  const countdown =
    left === 0
      ? "تم تجاوز الحد"
      : hours > 0
        ? `خلال ${hours} ساعة${minutes ? ` و${minutes} دقيقة` : ""}`
        : `خلال ${minutes} دقيقة`;
  return {
    remainingMinutes: left,
    text: `ستُغلق ورديتك تلقائياً ${countdown} دون عدّ الدرج — أغلقها وعدّ الدرج الآن`,
  };
}