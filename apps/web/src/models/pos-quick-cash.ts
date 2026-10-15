const CASH_BILLS = [50, 100, 200, 500];

/**
 * "بالضبط" plus the next three round notes above the total, so the cashier
 * rarely touches the keypad.
 */
export function quickCashOptions(total: number) {
  if (total <= 0) return [];
  const rounded = [
    ...new Set(CASH_BILLS.map((bill) => Math.ceil(total / bill) * bill)),
  ]
    .filter((amount) => amount > total)
    .sort((a, b) => a - b)
    .slice(0, 3);
  return rounded;
}
