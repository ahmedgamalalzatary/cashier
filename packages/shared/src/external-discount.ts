// The external catalog stores discount windows as bare local timestamps and
// evaluates them against a fixed UTC+3 clock (`DateTime.UtcNow.AddHours(3)`),
// which does not follow Egypt's daylight saving. Comparing against real
// Africa/Cairo time would disagree with the source catalog for half the year,
// so the offset below is intentionally fixed.
const EXTERNAL_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Converts an external catalog timestamp to epoch milliseconds. */
export function externalTimestampToMs(value: string): number {
  const hasZone = value.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(value);
  return hasZone
    ? Date.parse(value)
    : Date.parse(`${value}Z`) - EXTERNAL_OFFSET_MS;
}

/** True when an external product discount is active at `nowMs` (epoch ms). */
export function isExternalDiscountActive(
  discountPercentage: string | null,
  discountStart: string | null,
  discountEnd: string | null,
  nowMs: number,
): boolean {
  if (
    discountPercentage === null ||
    discountStart === null ||
    discountEnd === null
  ) {
    return false;
  }
  const start = externalTimestampToMs(discountStart);
  const end = externalTimestampToMs(discountEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  return nowMs >= start && nowMs <= end;
}
