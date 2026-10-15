import { testId } from "@cashier/shared/test-support";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Shift } from "@cashier/shared";
import { formatMoney } from "@cashier/web-core/lib/format";
import { ShiftCloseReport } from "../../../src/components/shifts/shift-close-report";

const baseShift = {
  id: testId(1),
  status: "closed",
  cashierUserId: testId(2),
  employeeId: testId(3),
  cashierName: "سارة",
  openingFloat: "200.00",
  openedAt: "2026-10-01T08:00:00.000Z",
  closedAt: "2026-10-01T16:00:00.000Z",
  closedByUserId: testId(2),
  workedMinutes: 480,
  totals: {
    ordersCount: 12,
    sales: "2000.00",
    discounts: "10.00",
    transferRequests: 1,
    refunds: "100.00",
    expenses: "650.00",
    wasteEntries: 2,
  },
  events: [],
} satisfies Omit<Shift, "actualCash" | "expectedCash" | "overShort">;

describe("shift close report (80mm)", () => {
  it("prints every cash figure for a counted shift", () => {
    const shift = {
      ...baseShift,
      actualCash: "1500.00",
      expectedCash: "1450.00",
      overShort: "50.00",
    } satisfies Shift;

    const html = renderToStaticMarkup(<ShiftCloseReport shift={shift} />);

    expect(html).toContain("receipt-print-root");
    expect(html).toContain("إغلاق وردية");
    expect(html).toContain("سارة");
    expect(html).toContain(formatMoney("200.00"));
    expect(html).toContain(formatMoney("2000.00"));
    expect(html).toContain(formatMoney("100.00"));
    expect(html).toContain(formatMoney("650.00"));
    expect(html).toContain(formatMoney("1450.00"));
    expect(html).toContain(formatMoney("1500.00"));
    expect(html).toContain(formatMoney("50.00"));
    expect(html).not.toContain("لم يُعدّ");
  });

  it("prints لم يُعدّ for an auto-closed shift with no counted cash", () => {
    const shift = {
      ...baseShift,
      actualCash: null,
      expectedCash: "1450.00",
      overShort: null,
    } satisfies Shift;

    const html = renderToStaticMarkup(<ShiftCloseReport shift={shift} />);

    expect(html).toContain("receipt-print-root");
    expect(html).toContain(formatMoney("1450.00"));
    // Counted cash and over/short are never assumed for an auto-close.
    expect(html.match(/لم يُعدّ/g)).toHaveLength(2);
    expect(html).not.toContain(formatMoney("1500.00"));
  });

  it("prints Cairo times whatever timezone the computer uses", async () => {
    const original = process.env.TZ;
    process.env.TZ = "America/New_York";
    vi.resetModules();
    try {
      const { ShiftCloseReport: Report } = await import(
        "../../../src/components/shifts/shift-close-report"
      );
      const shift = {
        ...baseShift,
        openedAt: "2026-07-01T22:30:00Z",
        actualCash: "0.00",
        expectedCash: "0.00",
        overShort: "0.00",
      } satisfies Shift;

      const html = renderToStaticMarkup(<Report shift={shift} />);
      const stamp = new Date("2026-07-01T22:30:00Z");
      const cairo = new Intl.DateTimeFormat("ar-EG", {
        timeZone: "Africa/Cairo",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(stamp);
      const newYork = new Intl.DateTimeFormat("ar-EG", {
        timeZone: "America/New_York",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(stamp);

      // near midnight the Cairo day is already the 2nd of July
      expect(html).toContain(cairo);
      expect(html).not.toContain(newYork);
    } finally {
      process.env.TZ = original;
    }
  });
});
