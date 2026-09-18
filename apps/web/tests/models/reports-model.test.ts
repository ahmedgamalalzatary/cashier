import { describe, expect, it } from "vitest";
import {
  isReportRangeReady,
  reportTotal,
} from "../../src/models/reports-model";
describe("reports model", () => {
  it("totals decimal report values without concatenating strings", () => {
    expect(
      reportTotal([{ amount: "12.50" }, { amount: "7.50" }], "amount"),
    ).toBe(20);
  });

  it("requires two non-empty dates in calendar order before fetching", () => {
    expect(isReportRangeReady("2026-09-01", "2026-09-30")).toBe(true);
    expect(isReportRangeReady("2026-09-30", "2026-09-30")).toBe(true);
    expect(isReportRangeReady("", "2026-09-30")).toBe(false);
    expect(isReportRangeReady("2026-09-01", "")).toBe(false);
    expect(isReportRangeReady("2026-10-01", "2026-09-30")).toBe(false);
  });
});
