import { describe, expect, it } from "vitest";
import { cairoCalendarDate } from "../../src/lib/cairo-date";

describe("cairoCalendarDate", () => {
  it("uses Cairo's next calendar day after Cairo midnight but before UTC midnight", () => {
    expect(cairoCalendarDate(new Date("2026-07-01T22:30:00.000Z"))).toBe(
      "2026-07-02",
    );
  });
});
