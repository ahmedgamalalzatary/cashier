import { testId } from "@cashier/shared/test-support";
import type {
  PeriodFigures,
  ReportsData,
} from "@cashier/web-core/services/reports-service";

export function periodFixture(values: Partial<PeriodFigures> = {}): PeriodFigures {
  return {
    sales: 100,
    refunds: 10,
    netSales: 90,
    ordersCount: 2,
    averageOrder: 50,
    cost: 30,
    returnedCost: 2,
    grossProfit: 62,
    margin: 68.9,
    expenses: 0,
    wasteCost: 0,
    salaries: 0,
    netProfit: 62,
    ...values,
  };
}

export function reportsFixture(): ReportsData {
  return {
    range: {
      from: "2026-09-01",
      to: "2026-09-10",
      branchId: testId(1),
      generatedAt: "2026-09-10T12:00:00Z",
    },
    overview: {
      current: periodFixture(),
      previous: {
        from: "2026-08-22",
        to: "2026-08-31",
        ...periodFixture({ netSales: 0, sales: 0, refunds: 0, grossProfit: 0, margin: null, netProfit: 0, ordersCount: 0, averageOrder: 0, cost: 0, returnedCost: 0 }),
      },
      byHour: Array.from({ length: 24 }, (_, hour) => ({
        hour,
        sales: hour === 9 ? 100 : 0,
        ordersCount: hour === 9 ? 2 : 0,
      })),
      topBySales: [{ productName: "لاتيه", sizeName: "كبير", value: 90 }],
      topByProfit: [{ productName: "لاتيه", sizeName: "كبير", value: 62 }],
      alerts: { lowStock: 0, negativeStock: 0, overShort: 0 },
    },
    sales: {
      byDay: [
        {
          day: "2026-09-10",
          sales: "100.00",
          refunds: "10.00",
          cost: "30.00",
          returnedCost: "2.00",
          profit: "62.00",
          ordersCount: 2,
        },
      ],
      byProduct: [],
      byCategory: [],
      byShift: [],
      byCashier: [],
    },
    stock: { current: [], lowStock: [], ledger: [], stocktakes: [] },
    money: {
      cashFlow: [],
      expenseBreakdown: [],
      expenses: [],
      shiftOverShort: [],
    },
    employees: { activity: [], salaryHistory: [], shiftHistory: [] },
    operations: {
      transfers: [],
      transferLines: [],
      requests: [],
      requestLines: [],
      preparations: [],
      ingredients: [],
    },
    wasteAndRefunds: {
      waste: [],
      wasteSummary: [],
      refunds: [],
      refundSummary: [],
    },
    suppliers: { summary: [], purchases: [], payments: [], purchaseLines: [] },
  };
}
