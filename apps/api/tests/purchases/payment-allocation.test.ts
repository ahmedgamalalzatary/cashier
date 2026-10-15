import { testId } from "@cashier/shared/test-support";
import { describe, expect, it } from "vitest";
import {
  allocateSupplierPayments,
  type AllocationInvoiceInput,
  type AllocationPaymentInput,
} from "../../src/modules/purchases/payment-allocation.js";

const invoice = (
  counter: number,
  purchasedAt: string,
  totalAmount: string,
  paidAmount = "0.00",
  createdAt = `${purchasedAt}T08:00:00.000Z`,
): AllocationInvoiceInput => ({
  id: testId(counter),
  purchasedAt,
  createdAt,
  totalAmount,
  paidAmount,
});

const payment = (
  counter: number,
  paidAt: string,
  amount: string,
  createdAt = `${paidAt}T08:00:00.000Z`,
): AllocationPaymentInput => ({
  id: testId(100 + counter),
  paidAt,
  createdAt,
  amount,
});

describe("allocateSupplierPayments", () => {
  it("covers the oldest invoice first, in date order", () => {
    const invoices = [
      invoice(3, "2026-07-03", "400.00"),
      invoice(1, "2026-07-01", "700.00"),
      invoice(2, "2026-07-02", "600.00"),
      invoice(4, "2026-07-04", "300.00"),
    ];
    const payments = [payment(1, "2026-07-05", "1000.00")];

    const { byInvoice, balance } = allocateSupplierPayments({
      openingBalance: "0.00",
      invoices,
      payments,
    });

    expect(byInvoice.get(testId(1))).toEqual({
      coveredAmount: "700.00",
      remainingAmount: "0.00",
      status: "paid",
    });
    expect(byInvoice.get(testId(2))).toEqual({
      coveredAmount: "300.00",
      remainingAmount: "300.00",
      status: "partial",
    });
    expect(byInvoice.get(testId(3))).toEqual({
      coveredAmount: "0.00",
      remainingAmount: "400.00",
      status: "credit",
    });
    expect(byInvoice.get(testId(4))).toEqual({
      coveredAmount: "0.00",
      remainingAmount: "300.00",
      status: "credit",
    });
    // 2000 invoiced − 1000 paid
    expect(balance).toBe("1000.00");
  });

  it("pays the opening balance before any invoice and leaves supplier credit", () => {
    const invoices = [invoice(1, "2026-07-10", "200.00")];
    const payments = [payment(1, "2026-07-11", "250.00")];

    const { byInvoice, balance } = allocateSupplierPayments({
      openingBalance: "150.00",
      invoices,
      payments,
    });

    expect(byInvoice.get(testId(1))).toEqual({
      coveredAmount: "100.00",
      remainingAmount: "100.00",
      status: "partial",
    });
    // opening covered by the first 150, then 100 of the 200 invoice
    expect(balance).toBe("100.00");
  });

  it("applies a payment to an opening balance with no invoices", () => {
    const partial = allocateSupplierPayments({
      openingBalance: "150.00",
      invoices: [],
      payments: [payment(1, "2026-07-05", "100.00")],
    });
    expect(partial.byInvoice.size).toBe(0);
    expect(partial.balance).toBe("50.00");

    const settled = allocateSupplierPayments({
      openingBalance: "150.00",
      invoices: [],
      payments: [payment(1, "2026-07-05", "200.00")],
    });
    expect(settled.balance).toBe("-50.00");
  });

  it("leaves a negative balance when the payment exceeds the total due", () => {
    const invoices = [
      invoice(1, "2026-07-01", "500.00"),
      invoice(2, "2026-07-02", "300.00"),
    ];

    const { byInvoice, balance } = allocateSupplierPayments({
      openingBalance: "0.00",
      invoices,
      payments: [payment(1, "2026-07-03", "1000.00")],
    });

    expect(byInvoice.get(testId(1))?.remainingAmount).toBe("0.00");
    expect(byInvoice.get(testId(2))?.remainingAmount).toBe("0.00");
    expect(byInvoice.get(testId(2))?.status).toBe("paid");
    expect(balance).toBe("-200.00");
  });

  it("keeps an invoice already paid at purchase paid", () => {
    const invoices = [
      invoice(1, "2026-07-01", "400.00", "400.00"),
      invoice(2, "2026-07-02", "200.00"),
    ];

    const { byInvoice, balance } = allocateSupplierPayments({
      openingBalance: "0.00",
      invoices,
      payments: [],
    });

    expect(byInvoice.get(testId(1))).toEqual({
      coveredAmount: "0.00",
      remainingAmount: "0.00",
      status: "paid",
    });
    expect(byInvoice.get(testId(2))).toEqual({
      coveredAmount: "0.00",
      remainingAmount: "200.00",
      status: "credit",
    });
    expect(balance).toBe("200.00");
  });

  it("orders same-day invoices by creation time, then id", () => {
    const invoices = [
      invoice(5, "2026-07-01", "100.00", "0.00", "2026-07-01T11:00:00.000Z"),
      invoice(6, "2026-07-01", "100.00", "0.00", "2026-07-01T10:00:00.000Z"),
    ];

    const { byInvoice } = allocateSupplierPayments({
      openingBalance: "0.00",
      invoices,
      payments: [payment(1, "2026-07-02", "100.00")],
    });

    // id 6 was created earlier, so it is settled first
    expect(byInvoice.get(testId(6))?.status).toBe("paid");
    expect(byInvoice.get(testId(5))?.status).toBe("credit");
  });

  it("breaks a creation-time tie by id", () => {
    const invoices = [
      invoice(9, "2026-07-01", "100.00", "0.00", "2026-07-01T10:00:00.000Z"),
      invoice(2, "2026-07-01", "100.00", "0.00", "2026-07-01T10:00:00.000Z"),
    ];

    const { byInvoice } = allocateSupplierPayments({
      openingBalance: "0.00",
      invoices,
      payments: [payment(1, "2026-07-02", "100.00")],
    });

    expect(byInvoice.get(testId(2))?.status).toBe("paid");
    expect(byInvoice.get(testId(9))?.status).toBe("credit");
  });
});
