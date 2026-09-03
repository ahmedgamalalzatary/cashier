import { describe, expect, it } from "vitest";
import {
  aggregateSalesDays,
  cairoMidnight,
} from "../../../../src/modules/reports/reports.service.js";

describe("report Cairo calendar boundaries", () => {
  it("uses the Cairo DST offset in summer and standard offset in winter", () => {
    expect(cairoMidnight("2026-07-01").toISOString()).toBe(
      "2026-06-30T21:00:00.000Z",
    );
    expect(cairoMidnight("2026-01-01").toISOString()).toBe(
      "2025-12-31T22:00:00.000Z",
    );
  });

  it("groups UTC timestamps by the Cairo business day", () => {
    expect(
      aggregateSalesDays([
        {
          createdAt: "2026-07-01T21:30:00.000Z",
          sales: "20",
          cost: "5",
          ordersCount: 1,
        },
      ]),
    ).toEqual([
      {
        day: "2026-07-02",
        sales: 20,
        discounts: 0,
        refunds: 0,
        cost: 5,
        returnedCost: 0,
        ordersCount: 1,
        profit: 15,
      },
    ]);
  });
});
