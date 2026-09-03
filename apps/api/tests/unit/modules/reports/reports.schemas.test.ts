import { describe, expect, it } from "vitest";
import { reportRangeQuery } from "../../../../src/modules/reports/reports.schemas.js";

describe("report range query", () => {
  it("accepts an inclusive ISO date range", () => {
    expect(
      reportRangeQuery.parse({ from: "2026-09-01", to: "2026-09-30" }),
    ).toEqual({ from: "2026-09-01", to: "2026-09-30" });
  });

  it("rejects invalid and reversed ranges", () => {
    expect(() =>
      reportRangeQuery.parse({ from: "2026-02-30", to: "2026-03-01" }),
    ).toThrow();
    expect(() =>
      reportRangeQuery.parse({ from: "2026-09-02", to: "2026-09-01" }),
    ).toThrow();
  });
});
