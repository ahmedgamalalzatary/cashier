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
