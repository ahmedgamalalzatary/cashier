import type { ReportRange } from "./reports.schemas.js";
import type { ReportsRepository } from "./reports.repository.js";

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
  const guess = new Date(`${value}T00:00:00Z`);
  const zone = new Intl.DateTimeFormat("en", {
    timeZone: "Africa/Cairo",
    timeZoneName: "longOffset",
  })
    .formatToParts(guess)
    .find((part) => part.type === "timeZoneName")?.value;
  const match = zone?.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!match) throw new Error("تعذر تحديد توقيت القاهرة");
  const offset =
    (Number(match[2]) * 60 + Number(match[3])) * (match[1] === "+" ? 1 : -1);
  return new Date(guess.getTime() - offset * 60_000);
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

export class ReportsService {
  constructor(private repo: ReportsRepository) {}
  async dashboard() {
    const day = cairoDate(),
      start = cairoMidnight(day),
      end = cairoMidnight(nextDate(day));
    const [summary, openShift, stock] = await Promise.all([
      this.repo.dashboard(start, end),
      this.repo.openShift(),
      this.repo.stock(),
    ]);
    return {
      summary: summary[0],
      openShift: openShift[0] ?? null,
      stock: stock.filter(
        (row) =>
          Boolean(row.isActive) &&
          Number(row.quantity) <= Number(row.minimumLevel),
      ),
    };
  }
  async report({ from, to }: ReportRange) {
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
      cashFlow,
      expenseBreakdown,
      employees,
      waste,
      wasteSummary,
      refunds,
      refundSummary,
      suppliers,
      supplierPurchases,
      supplierPayments,
    ] = await Promise.all([
      this.repo.salesByDay(start, end),
      this.repo.salesByProduct(start, end),
      this.repo.salesByCategory(start, end),
      this.repo.salesByShift(start, end),
      this.repo.salesByCashier(start, end),
      this.repo.stock(),
      this.repo.ledger(start, end),
      this.repo.cashFlow(start, end, from, to),
      this.repo.expenseBreakdown(from, to),
      this.repo.employees(start, end, from, to),
      this.repo.waste(start, end),
      this.repo.wasteSummary(start, end),
      this.repo.refunds(start, end),
      this.repo.refundSummary(start, end),
      this.repo.suppliers(),
      this.repo.supplierPurchases(from, to),
      this.repo.supplierPayments(from, to),
    ]);
    const lowStock = stock.filter(
      (row) =>
        Boolean(row.isActive) &&
        Number(row.quantity) <= Number(row.minimumLevel),
    );
    return {
      range: { from, to },
      sales: {
        byDay: aggregateSalesDays(byDay),
        byProduct,
        byCategory,
        byShift,
        byCashier,
      },
      stock: { current: stock, lowStock, ledger },
      money: { cashFlow, expenseBreakdown, shiftOverShort: byShift },
      employees,
      wasteAndRefunds: { waste, wasteSummary, refunds, refundSummary },
      suppliers: {
        summary: suppliers,
        purchases: supplierPurchases,
        payments: supplierPayments,
      },
    };
  }
}
