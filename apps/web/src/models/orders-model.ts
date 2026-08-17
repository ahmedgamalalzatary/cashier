import type { OrderSummary } from "@cashier/shared";
import { cairoCalendarDate } from "../lib/cairo-date";
import { formatMoney, sumDecimalValues } from "../lib/format";

export type OrderFilters = {
  query: string;
  cashierId: number | null;
  /** Cairo calendar day, `YYYY-MM-DD`; empty means every day. */
  day: string;
};

/** An order is found by what the counter remembers: its number, or who rang it. */
export function filterOrders(orders: OrderSummary[], filters: OrderFilters) {
  const query = filters.query.trim().toLocaleLowerCase("ar");
  return orders.filter((order) => {
    if (filters.cashierId !== null && order.cashierId !== filters.cashierId)
      return false;
    if (filters.day && cairoCalendarDate(new Date(order.createdAt)) !== filters.day)
      return false;
    if (!query) return true;
    return (
      order.orderNumber.toLocaleLowerCase("ar").includes(query) ||
      order.cashierName.toLocaleLowerCase("ar").includes(query)
    );
  });
}

const arabicNumber = new Intl.NumberFormat("ar-EG");

export function ordersTotals(orders: OrderSummary[]) {
  return {
    count: orders.length,
    // beside a column of money, a Latin "12" reads as a different alphabet
    countLabel: arabicNumber.format(orders.length),
    sales: formatMoney(sumDecimalValues(orders.map((order) => order.total))),
    discounts: formatMoney(
      sumDecimalValues(orders.map((order) => order.discountAmount)),
    ),
  };
}

/**
 * `POS-20260802-E24D855D` is two facts: the day the counter was open, and the
 * code that identifies this sale. Splitting them lets the code carry the weight
 * and the day step back.
 */
export function splitOrderNumber(orderNumber: string) {
  const parts = orderNumber.split("-");
  const separator = parts.length > 2 ? orderNumber.lastIndexOf("-") : -1;
  const prefix = separator > 0 ? orderNumber.slice(0, separator) : "";
  const code = prefix ? orderNumber.slice(separator + 1) : orderNumber;
  return { prefix, code };
}

/** Cost and profit of a single order, for admin eyes only. */
export function orderMargin(order: Pick<OrderSummary, "total" | "totalCost">) {
  return {
    cost: formatMoney(order.totalCost),
    profit: formatMoney(sumDecimalValues([order.total, `-${order.totalCost}`])),
  };
}

/** The cashiers present in the list, so the filter offers only real choices. */
export function orderCashiers(orders: OrderSummary[]) {
  const byId = new Map<number, string>();
  for (const order of orders) {
    if (!byId.has(order.cashierId)) byId.set(order.cashierId, order.cashierName);
  }
  return [...byId].map(([id, name]) => ({ id, name }));
}
