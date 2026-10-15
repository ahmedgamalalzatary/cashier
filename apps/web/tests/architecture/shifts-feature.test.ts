import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("shifts feature boundaries", () => {
  it("shows the cashier action totals exposed by a shift", () => {
    const page = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/shifts/page.tsx"),
      "utf8",
    );

    expect(page).toContain("activeShift.totals.sales");
    expect(page).toContain("activeShift.totals.discounts");
    expect(page).toContain("activeShift.totals.transferRequests");
    expect(page).toContain("activeShift.totals.refunds");
    expect(page).toContain("activeShift.totals.expenses");
    expect(page).toContain("activeShift.totals.wasteEntries");
  });
});

describe("shift close report", () => {
  const read = (relative: string) =>
    fs.readFileSync(path.resolve(process.cwd(), relative), "utf8");

  it("prints from the cashier close flow after closing", () => {
    const controls = read("src/components/shifts/cashier-shift-controls.tsx");
    expect(controls).toContain("ShiftCloseReport");
    expect(controls).toContain("window.print()");
  });

  it("prints per shift from the shift history", () => {
    const history = read("src/components/shifts/shift-history.tsx");
    expect(history).toContain("<ShiftCloseReport");
    expect(history).toContain("<PrintSlip");
    expect(history).toContain("usePrintSlip");
  });

  it("prints the report on the 80mm receipt page", () => {
    expect(read("src/components/shifts/shift-close-report.tsx")).toContain(
      "Slip",
    );
  });
});
