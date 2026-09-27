import type { ReportRange } from "./reports.schemas.js";
import type { ReportsRepository } from "./reports.repository.js";
import { currentBranchId } from "../../db/branch-context.js";

const cairoDate = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
function nextDate(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
export function cairoMidnight(value: string) {
  const guess = new Date(`${value}T00:00:00Z`).getTime();
  // Find the first instant of this calendar day. Cairo can skip midnight
  // when DST starts, so subtracting the offset at UTC midnight is insufficient.
  let low = guess - 86_400_000,
    high = guess + 86_400_000;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (dayFormat.format(new Date(middle)) < value) low = middle + 1;
    else high = middle;
  }
  return new Date(low);
}
const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Cairo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export function aggregateSalesDays(rows: Record<string, unknown>[]) {
  const days = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const day = dayFormat.format(new Date(row.createdAt as string | Date));
    const current = days.get(day) ?? {
      sales: 0,
      discounts: 0,
      refunds: 0,
      cost: 0,
      returnedCost: 0,
      ordersCount: 0,
    };
    for (const key of Object.keys(current))
      current[key] = (current[key] ?? 0) + Number(row[key] ?? 0);
    days.set(day, current);
  }
  return [...days].map(([day, value]) => ({
    day,
    ...value,
    profit: value.sales! - value.refunds! - value.cost! + value.returnedCost!,
  }));
}

// Zero disables threshold alerts, but a negative balance always needs attention.
const isLowStock = (row: Record<string, unknown>) =>
  Boolean(row.isActive) &&
  (Number(row.quantity) < 0 ||
    (Number(row.minimumLevel) > 0 &&
      Number(row.quantity) <= Number(row.minimumLevel)));

export class ReportsService {
  constructor(private repo: ReportsRepository) {}
  async dashboard() {
    const day = cairoDate(),
      start = cairoMidnight(day),
      end = cairoMidnight(nextDate(day));
    const [summary, openShifts, stock] = await Promise.all([
      this.repo.dashboard(start, end),
      this.repo.openShifts(),
      this.repo.stock(),
    ]);
    return {
      summary: summary[0],
      openShifts,
      stock: stock.filter(isLowStock),
    };
  }
  report(range: ReportRange) {
    return this.repo.snapshot((repo) =>
      new ReportsService(repo).buildReport(range),
    );
  }
  private async buildReport({ from, to }: ReportRange) {
    const start = cairoMidnight(from),
      end = cairoMidnight(nextDate(to));
    const [
      byDay,
      byProduct,
      byCategory,
      byShift,
      byCashier,
      stock,
      ledger,
      stocktakes,
      cashFlow,
      expenseBreakdown,
      employees,
      salaryHistory,
      waste,
      wasteSummary,
      refunds,
      refundSummary,
      suppliers,
      supplierPurchases,
      supplierPayments,
      shiftHistory,
      expenses,
      transfers,
      transferLines,
      requests,
      requestLines,
      preparations,
      ingredients,
      purchaseLines,
    ] = await Promise.all([
      this.repo.salesByDay(start, end),
      this.repo.salesByProduct(start, end),
      this.repo.salesByCategory(start, end),
      this.repo.salesByShift(start, end),
      this.repo.salesByCashier(start, end),
      this.repo.stock(),
      this.repo.ledger(start, end),
      this.repo.stocktakes(start, end),
      this.repo.cashFlow(start, end, from, to),
      this.repo.expenseBreakdown(from, to),
      this.repo.employees(start, end, from, to),
      this.repo.salaryHistory(start, end, from, to),
      this.repo.waste(start, end),
      this.repo.wasteSummary(start, end),
      this.repo.refunds(start, end),
      this.repo.refundSummary(start, end),
      this.repo.suppliers(),
      this.repo.supplierPurchases(from, to),
      this.repo.supplierPayments(from, to),
      this.repo.shiftHistory(start, end),
      this.repo.expenses(from, to),
      this.repo.transfers(start, end),
      this.repo.transferLines(start, end),
      this.repo.transferRequests(start, end),
      this.repo.transferRequestLines(start, end),
      this.repo.preparations(start, end),
      this.repo.preparationIngredients(start, end),
      this.repo.purchaseLines(from, to),
    ]);
    const lowStock = stock.filter(isLowStock);
    return {
      range: {
        from,
        to,
        branchId: currentBranchId(),
        generatedAt: new Date().toISOString(),
      },
      sales: {
        byDay: aggregateSalesDays(byDay),
        byProduct,
        byCategory,
        byShift,
        byCashier,
      },
      stock: { current: stock, lowStock, ledger, stocktakes },
      money: {
        cashFlow,
        expenses,
        expenseBreakdown,
        shiftOverShort: shiftHistory.filter((row) =>
          ["close", "admin_close", "correction"].includes(String(row.action)),
        ),
      },
      employees: { activity: employees, salaryHistory, shiftHistory },
      operations: {
        transfers,
        transferLines,
        requests,
        requestLines,
        preparations,
        ingredients,
      },
      wasteAndRefunds: { waste, wasteSummary, refunds, refundSummary },
      suppliers: {
        summary: suppliers,
        purchases: supplierPurchases,
        payments: supplierPayments,
        purchaseLines,
      },
    };
  }
}
