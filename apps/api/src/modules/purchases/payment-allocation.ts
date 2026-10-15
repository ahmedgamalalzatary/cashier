/**
 * Supplier payment allocation (spec §5): payments are applied in date order to
 * the supplier's opening balance first, then to the oldest unpaid invoice. The
 * result is computed from the stored rows, never written back, so an invoice's
 * paid-at-purchase amount is immutable.
 */

export type AllocationStatus = "paid" | "partial" | "credit";

export type AllocationInvoiceInput = {
  id: string;
  purchasedAt: string;
  /** Drizzle timestamps arrive as Date; callers and tests may pass an ISO string. */
  createdAt: Date | string;
  totalAmount: string;
  paidAmount: string;
};

export type AllocationPaymentInput = {
  id: string;
  paidAt: string;
  createdAt: Date | string;
  amount: string;
};

export type InvoiceAllocation = {
  coveredAmount: string;
  remainingAmount: string;
  status: AllocationStatus;
};

const toCents = (value: string) => {
  const negative = value.startsWith("-");
  const [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
  const cents =
    BigInt(whole || "0") * 100n +
    BigInt(fraction.padEnd(2, "0").slice(0, 2) || "0");
  return negative ? -cents : cents;
};

const fromCents = (value: bigint) => {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return `${negative ? "-" : ""}${absolute / 100n}.${(absolute % 100n)
    .toString()
    .padStart(2, "0")}`;
};

const timeOf = (value: Date | string) =>
  value instanceof Date ? value.getTime() : new Date(value).getTime();

const invoiceOrder = (a: AllocationInvoiceInput, b: AllocationInvoiceInput) =>
  a.purchasedAt.localeCompare(b.purchasedAt) ||
  timeOf(a.createdAt) - timeOf(b.createdAt) ||
  a.id.localeCompare(b.id);

const paymentOrder = (a: AllocationPaymentInput, b: AllocationPaymentInput) =>
  a.paidAt.localeCompare(b.paidAt) ||
  timeOf(a.createdAt) - timeOf(b.createdAt) ||
  a.id.localeCompare(b.id);

export function allocateSupplierPayments({
  openingBalance,
  invoices,
  payments,
}: {
  openingBalance: string;
  invoices: AllocationInvoiceInput[];
  payments: AllocationPaymentInput[];
}): { byInvoice: Map<string, InvoiceAllocation>; balance: string } {
  const openingCents = toCents(openingBalance);
  // oldest payment first; each fills the oldest open debt in turn
  let pool = [...payments]
    .sort(paymentOrder)
    .reduce((total, payment) => total + toCents(payment.amount), 0n);

  if (openingCents > 0n) {
    const covered = pool < openingCents ? pool : openingCents;
    pool -= covered;
  }

  const byInvoice = new Map<string, InvoiceAllocation>();
  let owedTotal = 0n;
  for (const invoice of [...invoices].sort(invoiceOrder)) {
    const paidAtPurchase = toCents(invoice.paidAmount);
    const owed = toCents(invoice.totalAmount) - paidAtPurchase;
    owedTotal += owed;
    const covered = owed > 0n ? (pool < owed ? pool : owed) : 0n;
    pool -= covered;
    const remaining = owed - covered;
    byInvoice.set(invoice.id, {
      coveredAmount: fromCents(covered),
      remainingAmount: fromCents(remaining),
      status:
        remaining <= 0n
          ? "paid"
          : paidAtPurchase + covered > 0n
            ? "partial"
            : "credit",
    });
  }

  const paymentsTotal = payments.reduce(
    (total, payment) => total + toCents(payment.amount),
    0n,
  );
  return {
    byInvoice,
    balance: fromCents(openingCents + owedTotal - paymentsTotal),
  };
}
