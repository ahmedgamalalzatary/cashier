import { testId } from "@cashier/shared/test-support";
import { describe, expect, it, vi } from "vitest";
import { withBranch } from "@cashier/db";
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

  it("starts the report at the first instant of a Cairo day when DST skips midnight", () => {
    expect(cairoMidnight("2026-04-24").toISOString()).toBe(
      "2026-04-23T22:00:00.000Z",
    );
    expect(cairoMidnight("2026-10-30").toISOString()).toBe(
      "2026-10-29T22:00:00.000Z",
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
  it("keeps active low and negative stock and an empty active-shift list", async () => {
    const repo = {
      dashboard: vi.fn(async () => [{ sales: "10.00" }]),
      openShifts: vi.fn(async () => []),
      stock: vi.fn(async () => [
        { id: testId(1), isActive: true, quantity: "2.000", minimumLevel: "5.000" },
        { id: testId(2), isActive: true, quantity: "9.000", minimumLevel: "5.000" },
        { id: testId(3), isActive: false, quantity: "0.000", minimumLevel: "5.000" },
        { id: testId(4), isActive: 1, quantity: "1.000", minimumLevel: "5.000" },
        { id: testId(5), isActive: true, quantity: "-1.000", minimumLevel: "0.000" },
        { id: testId(6), isActive: false, quantity: "-1.000", minimumLevel: "0.000" },
        { id: testId(7), isActive: true, quantity: "1.000", minimumLevel: "0.000" },
        { id: testId(8), isActive: true, quantity: "0.000", minimumLevel: "0.000" },
        { id: testId(9), isActive: true, quantity: "5.000", minimumLevel: "5.000" },
      ]),
    } as unknown as ReportsRepository;

    const dashboard = await new ReportsService(repo).dashboard();

    expect(dashboard.summary).toEqual({ sales: "10.00" });
    expect(dashboard.openShifts).toEqual([]);
    expect(dashboard.stock.map((row) => row.id)).toEqual([testId(1), testId(4), testId(5), testId(9)]);
  });

  it("does not flag an item that has no minimum level set", async () => {
    const repo = {
      dashboard: vi.fn(async () => []),
      openShifts: vi.fn(async () => []),
      stock: vi.fn(async () => [
        { id: testId(1), isActive: true, quantity: "0.000", minimumLevel: "0.000" },
        { id: testId(2), isActive: true, quantity: "0.000", minimumLevel: "5.000" },
      ]),
    } as unknown as ReportsRepository;

    const dashboard = await new ReportsService(repo).dashboard();

    expect(dashboard.stock.map((row) => row.id)).toEqual([testId(2)]);
  });
});

describe("report overview", () => {
  const totals = (values: Record<string, string | number>) => ({
    sales: "0.00",
    ordersCount: 0,
    cost: "0.00",
    refunds: "0.00",
    returnedCost: "0.00",
    expenses: "0.00",
    wasteCost: "0.00",
    salaryPayments: "0.00",
    salaryAdvances: "0.00",
    ...values,
  });
  function fakeRepo(current: object, previous: object) {
    const empty = vi.fn(async () => []);
    const periodTotals = vi
      .fn()
      .mockResolvedValueOnce([current])
      .mockResolvedValueOnce([previous]);
    const repo = new Proxy(
      {
        periodTotals,
        snapshot: (read: (repo: unknown) => unknown) => read(repo),
        salesByDay: vi.fn(async () => [
          { createdAt: "2026-09-10T06:15:00.000Z", sales: "60", ordersCount: 1 },
          { createdAt: "2026-09-10T06:45:00.000Z", sales: "40", ordersCount: 1 },
          { createdAt: "2026-09-10T18:00:00.000Z", sales: "0", refunds: "10", ordersCount: 0 },
        ]),
        salesByProduct: vi.fn(async () =>
          ["A", "B", "C", "D", "E", "F"].map((name, index) => ({
            productName: name,
            sizeName: null,
            sales: String(100 - index * 10),
            refunds: name === "A" ? "95" : "0",
            profit: String(index * 5 - 1),
          })),
        ),
        stock: vi.fn(async () => [
          { isActive: true, quantity: "-2", minimumLevel: "0" },
          { isActive: true, quantity: "1", minimumLevel: "5" },
          { isActive: true, quantity: "0", minimumLevel: "5" },
        ]),
        shiftHistory: vi.fn(async () => [
          { action: "close", overShort: "-5.00" },
          { action: "close", overShort: "0.00" },
          { action: "admin_close", overShort: null },
          { action: "open", overShort: null },
        ]),
      } as Record<string, unknown>,
      { get: (target, key: string) => target[key] ?? empty },
    );
    return { repo: repo as unknown as ReportsRepository, periodTotals };
  }
  const report = (repo: ReportsRepository, from: string, to: string) =>
    withBranch(testId(1), () => new ReportsService(repo).report({ from, to }), false);

  it("compares the range with the previous period of the same length", async () => {
    const { repo, periodTotals } = fakeRepo(totals({}), totals({}));

    await report(repo, "2026-09-08", "2026-09-10");

    // 3 days → the 3 days before, as Cairo instants and calendar dates
    expect(periodTotals.mock.calls[1]).toEqual([
      new Date("2026-09-04T21:00:00.000Z"),
      new Date("2026-09-07T21:00:00.000Z"),
      "2026-09-05",
      "2026-09-07",
    ]);
  });

  it("works out every figure, net profit after expenses, waste and salaries", async () => {
    const { repo } = fakeRepo(
      totals({
        sales: "1000.00",
        ordersCount: 8,
        cost: "400.00",
        refunds: "100.00",
        returnedCost: "30.00",
        expenses: "120.00",
        wasteCost: "15.50",
        salaryPayments: "200.00",
        salaryAdvances: "50.00",
      }),
      totals({ sales: "500.00", ordersCount: 4, cost: "250.00" }),
    );

    const { overview } = await report(repo, "2026-09-10", "2026-09-10");

    expect(overview.current).toEqual({
      sales: 1000,
      refunds: 100,
      netSales: 900,
      ordersCount: 8,
      averageOrder: 125,
      cost: 400,
      returnedCost: 30,
      grossProfit: 530,
      margin: 58.9,
      expenses: 120,
      wasteCost: 15.5,
      salaries: 250,
      netProfit: 144.5,
    });
    expect(overview.previous).toMatchObject({
      from: "2026-09-09",
      to: "2026-09-09",
      netSales: 500,
      grossProfit: 250,
      margin: 50,
    });
    expect(overview.byHour).toHaveLength(24);
    // 06:15 and 06:45 UTC are 09:xx in Cairo summer time
    expect(overview.byHour[9]).toEqual({ hour: 9, sales: 100, ordersCount: 2 });
    expect(overview.byHour[21]).toEqual({ hour: 21, sales: 0, ordersCount: 0 });
    expect(overview.topBySales.map((row) => row.productName)).toEqual([
      "B",
      "C",
      "D",
      "E",
      "F",
    ]);
    expect(overview.topByProfit.map((row) => row.productName)).toEqual([
      "F",
      "E",
      "D",
      "C",
      "B",
    ]);
    expect(overview.alerts).toEqual({
      lowStock: 2,
      negativeStock: 1,
      overShort: 1,
    });
  });

  it("gives zeros, not errors, for an empty period and an empty previous period", async () => {
    const { repo } = fakeRepo(totals({}), totals({}));

    const { overview } = await report(repo, "2026-09-10", "2026-09-10");

    expect(overview.current).toMatchObject({
      netSales: 0,
      averageOrder: 0,
      margin: null,
      netProfit: 0,
    });
    expect(overview.previous.netSales).toBe(0);
    expect(Number.isFinite(overview.current.averageOrder)).toBe(true);
  });
});
