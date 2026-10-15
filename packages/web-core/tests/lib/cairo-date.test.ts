import { describe, expect, it } from "vitest";
import { cairoCalendarDate, cairoCalendarLabel } from "../../src/lib/cairo-date";

describe("cairoCalendarDate", () => {
  it("uses Cairo's next calendar day after Cairo midnight but before UTC midnight", () => {
    expect(cairoCalendarDate(new Date("2026-07-01T22:30:00.000Z"))).toBe(
      "2026-07-02",
    );
  });
});

const arabicDate = (date: Date) =>
  new Intl.DateTimeFormat("ar-EG", {
    timeZone: "Africa/Cairo",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);

describe("cairoCalendarLabel", () => {
  it("shows an Arabic calendar day in Cairo", () => {
    expect(cairoCalendarLabel(new Date("2026-07-01T22:30:00.000Z"))).toBe(
      arabicDate(new Date("2026-07-01T22:30:00.000Z")),
    );
  });

  it("anchors a YYYY-MM-DD calendar date at noon so it cannot shift days", () => {
    expect(cairoCalendarLabel("2026-07-01")).toBe(
      arabicDate(new Date("2026-07-01T12:00:00.000Z")),
    );
  });
});

