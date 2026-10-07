import type { ReportsData } from '@cashier/web-core/services/reports-service';

export function reportsFixture(): ReportsData {
  return {
    range: {
      from: "2026-09-01",
      to: "2026-09-10",
      branchId: 1,
      generatedAt: "2026-09-10T12:00:00Z",
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
