export function cairoCalendarDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;

  return `${value("year")}-${value("month")}-${value("day")}`;
}

/** Hour of the Cairo day, 0–23. */
export function cairoHour(date = new Date()) {
  return Number(
    new Intl.DateTimeFormat("en", {
      timeZone: "Africa/Cairo",
      hour: "numeric",
      hourCycle: "h23",
    }).format(date),
  );
}

/** Wall-clock time as the shop reads it, e.g. ٩:٤١ ص */
export function cairoClock(date = new Date()) {
  return new Intl.DateTimeFormat("ar-EG", {
    timeZone: "Africa/Cairo",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** Calendar day in words, e.g. الأحد ٢ أغسطس */
export function cairoDayLabel(date = new Date()) {
  return new Intl.DateTimeFormat("ar-EG", {
    timeZone: "Africa/Cairo",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

const cairoDayMonthYear = new Intl.DateTimeFormat("ar-EG", {
  timeZone: "Africa/Cairo",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * Arabic calendar day for display, e.g. ١٥ أكتوبر ٢٠٢٦. A "YYYY-MM-DD" value is
 * a calendar date with no timezone, so it is anchored at noon UTC: that keeps
 * it on the same Cairo day instead of sliding to the day before.
 */
export function cairoCalendarLabel(value: Date | string = new Date()) {
  return cairoDayMonthYear.format(
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T12:00:00Z`)
      : new Date(value),
  );
}
