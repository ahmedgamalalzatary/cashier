import type { ReportRange } from "./reports.schemas.js";
import type { ReportsRepository } from "./reports.repository.js";
import { currentBranchId } from "@cashier/db";

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

const round = (value: number) => Math.round(value * 100) / 100;

/** The same number of days immediately before the range. */
export function previousRange(from: string, to: string) {
  const days =
    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) /
    86_400_000;
  const end = new Date(`${from}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

/**
 * Headline figures of one period. Net profit = gross profit − expenses −
 * waste cost − salaries and advances paid (owner decision 2026-10-15).
 */
export function periodFigures(row: Record<string, unknown> = {}) {
  const value = (key: string) => Number(row[key] ?? 0);
  const sales = value("sales"),
    refunds = value("refunds"),
    ordersCount = value("ordersCount"),
    cost = value("cost"),
    returnedCost = value("returnedCost"),
    netSales = sales - refunds,
    grossProfit = sales - refunds - cost + returnedCost,
    expenses = value("expenses"),
    wasteCost = value("wasteCost"),
    salaries = value("salaryPayments") + value("salaryAdvances");
  return {
    sales: round(sales),
    refunds: round(refunds),
    netSales: round(netSales),
    ordersCount,
    averageOrder: ordersCount ? round(sales / ordersCount) : 0,
    cost: round(cost),
    returnedCost: round(returnedCost),
    grossProfit: round(grossProfit),
    margin: netSales > 0 ? Math.round((grossProfit / netSales) * 1000) / 10 : null,
    expenses: round(expenses),
    wasteCost: round(wasteCost),
    salaries: round(salaries),
    netProfit: round(grossProfit - expenses - wasteCost - salaries),
  };
}

const hourFormat = new Intl.DateTimeFormat("en", {
  timeZone: "Africa/Cairo",
  hour: "numeric",
  hourCycle: "h23",
});

/** Order sales by Cairo hour of the day, every hour 0–23 present. */
export function salesByHour(rows: Record<string, unknown>[]) {
  const hours = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    sales: 0,
    ordersCount: 0,
  }));
  for (const row of rows) {
    if (!Number(row.ordersCount)) continue;
    const hour = hours[Number(hourFormat.format(new Date(row.createdAt as string | Date)))]!;
    hour.sales = round(hour.sales + Number(row.sales ?? 0));
    hour.ordersCount += Number(row.ordersCount);
  }
  return hours;
}

/** The five best products by a figure; nothing that sold at a loss or not at all. */
function topProducts(
  rows: Record<string, unknown>[],
  figure: (row: Record<string, unknown>) => number,
) {
  return rows
    .map((row) => ({
      productName: row.productName,
      sizeName: row.sizeName ?? null,
      value: round(figure(row)),
    }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
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
      end = cairoMidnight(nextDate(to)),
      previous = previousRange(from, to);
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
      [currentTotals],
      [previousTotals],
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
      this.repo.periodTotals(start, end, from, to),
      this.repo.periodTotals(
        cairoMidnight(previous.from),
        start,
        previous.from,
        previous.to,
      ),
    ]);
    const lowStock = stock.filter(isLowStock);
    const shiftOverShort = shiftHistory.filter((row) =>
      ["close", "admin_close", "correction"].includes(String(row.action)),
    );
    return {
      range: {
        from,
        to,
        branchId: currentBranchId(),
        generatedAt: new Date().toISOString(),
      },
      overview: {
        current: periodFigures(currentTotals),
        previous: { ...previous, ...periodFigures(previousTotals) },
        byHour: salesByHour(byDay),
        topBySales: topProducts(
          byProduct,
          (row) => Number(row.sales ?? 0) - Number(row.refunds ?? 0),
        ),
        topByProfit: topProducts(byProduct, (row) => Number(row.profit ?? 0)),
        alerts: {
          lowStock: lowStock.filter((row) => Number(row.quantity) >= 0).length,
          negativeStock: lowStock.filter((row) => Number(row.quantity) < 0)
            .length,
          overShort: shiftOverShort.filter(
            (row) => row.overShort != null && Number(row.overShort) !== 0,
          ).length,
        },
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
        shiftOverShort,
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
