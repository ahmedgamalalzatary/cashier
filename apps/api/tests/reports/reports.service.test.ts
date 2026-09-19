import { describe, expect, it, vi } from "vitest";
import type { ReportsRepository } from "../../src/modules/reports/reports.repository.js";
import {
  aggregateSalesDays,
  cairoMidnight,
  ReportsService,
} from "../../src/modules/reports/reports.service.js";

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

  it("sums same-day rows and splits days with full profit math", () => {
    expect(
      aggregateSalesDays([
        {
          createdAt: "2026-07-01T10:00:00.000Z",
          sales: "100",
          discounts: "10",
          refunds: "20",
          cost: "30",
          returnedCost: "5",
          ordersCount: 2,
        },
        {
          createdAt: "2026-07-01T12:00:00.000Z",
          sales: "50",
          discounts: "0",
          refunds: "0",
          cost: "10",
          returnedCost: "0",
          ordersCount: 1,
        },
        {
          createdAt: "2026-07-01T22:30:00.000Z",
          sales: "40",
          discounts: "0",
          refunds: "0",
          cost: "8",
          returnedCost: "0",
          ordersCount: 1,
        },
      ]),
    ).toEqual([
      {
        day: "2026-07-01",
        sales: 150,
        discounts: 10,
        refunds: 20,
        cost: 40,
        returnedCost: 5,
        ordersCount: 3,
        profit: 95,
      },
      {
        day: "2026-07-02",
        sales: 40,
        discounts: 0,
        refunds: 0,
        cost: 8,
        returnedCost: 0,
        ordersCount: 1,
        profit: 32,
      },
    ]);
  });

  it("returns an empty series without rows", () => {
    expect(aggregateSalesDays([])).toEqual([]);
  });
});

describe("ReportsService.dashboard", () => {
  it("keeps only active low stock and nulls a missing open shift", async () => {
    const repo = {
      dashboard: vi.fn(async () => [{ sales: "10.00" }]),
      openShift: vi.fn(async () => []),
      stock: vi.fn(async () => [
        { id: 1, isActive: true, quantity: "2.000", minimumLevel: "5.000" },
        { id: 2, isActive: true, quantity: "9.000", minimumLevel: "5.000" },
        { id: 3, isActive: false, quantity: "0.000", minimumLevel: "5.000" },
        { id: 4, isActive: 1, quantity: "1.000", minimumLevel: "5.000" },
      ]),
    } as unknown as ReportsRepository;

    const dashboard = await new ReportsService(repo).dashboard();

    expect(dashboard.summary).toEqual({ sales: "10.00" });
    expect(dashboard.openShift).toBeNull();
    expect(dashboard.stock.map((row) => row.id)).toEqual([1, 4]);
  });
});
