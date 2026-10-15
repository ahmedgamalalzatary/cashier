import { testId } from "@cashier/shared/test-support";
import { describe, expect, it, vi } from "vitest";
import type { PurchasesRepository } from "../../src/modules/purchases/purchases.repository.js";
import { PurchasesService } from "../../src/modules/purchases/purchases.service.js";

const supplierA = testId(101);
const supplierB = testId(102);
const firstInvoice = testId(1);
const secondInvoice = testId(2);
const otherInvoice = testId(3);

const invoiceRow = (
  id: string,
  supplierId: string,
  purchasedAt: string,
  totalAmount: string,
) => ({
  id,
  supplierId,
  purchasedAt,
  createdAt: `${purchasedAt}T08:00:00.000Z`,
  totalAmount,
  paidAmount: "0.00",
});

describe("PurchasesService payment allocation", () => {
  it("decorates every listed invoice with covered, remaining and status per supplier", async () => {
    const repo = {
      list: vi.fn(async () => [
        invoiceRow(firstInvoice, supplierA, "2026-07-01", "700.00"),
        invoiceRow(secondInvoice, supplierA, "2026-07-02", "600.00"),
        invoiceRow(otherInvoice, supplierB, "2026-07-03", "100.00"),
      ]),
      listInvoicesWithStock: vi.fn(async () => []),
      listSupplierOpeningBalances: vi.fn(async () => [
        { supplierId: supplierA, openingBalance: "0.00" },
        { supplierId: supplierB, openingBalance: "0.00" },
      ]),
      listStandalonePayments: vi.fn(async () => [
        {
          supplierId: supplierA,
          id: testId(201),
          paidAt: "2026-07-04",
          createdAt: "2026-07-04T08:00:00.000Z",
          amount: "700.00",
        },
      ]),
    } as unknown as PurchasesRepository;

    const rows = await new PurchasesService(repo).list();
    const byId = new Map(rows.map((row) => [row.id, row]));

    expect(byId.get(firstInvoice)).toMatchObject({
      coveredAmount: "700.00",
      remainingAmount: "0.00",
      status: "paid",
    });
    expect(byId.get(secondInvoice)).toMatchObject({
      coveredAmount: "0.00",
      remainingAmount: "600.00",
      status: "credit",
    });
    expect(byId.get(otherInvoice)).toMatchObject({
      coveredAmount: "0.00",
      remainingAmount: "100.00",
      status: "credit",
    });
  });

  it("adds the invoice allocation and the supplier balance on detail", async () => {
    const repo = {
      findById: vi.fn(async () => ({
        ...invoiceRow(firstInvoice, supplierA, "2026-07-01", "700.00"),
        dueAmount: "700.00",
      })),
      listLines: vi.fn(async () => []),
      listLinkedTransfers: vi.fn(async () => []),
      listSupplierInvoices: vi.fn(async () => [
        invoiceRow(firstInvoice, supplierA, "2026-07-01", "700.00"),
        invoiceRow(secondInvoice, supplierA, "2026-07-02", "600.00"),
      ]),
      listSupplierOpeningBalance: vi.fn(async () => "50.00"),
      listStandalonePayments: vi.fn(async () => [
        {
          supplierId: supplierA,
          id: testId(201),
          paidAt: "2026-07-04",
          createdAt: "2026-07-04T08:00:00.000Z",
          amount: "700.00",
        },
      ]),
    } as unknown as PurchasesRepository;

    const detail = await new PurchasesService(repo).get(firstInvoice);

    // the 50 opening balance is covered first, so 650 of the payment reaches
    // the first invoice and 50 stays owed on it
    expect(detail).toMatchObject({
      coveredAmount: "650.00",
      remainingAmount: "50.00",
      status: "partial",
    });
    // 50 opening + 1300 invoiced − 700 paid
    expect(detail.supplierBalance).toBe("650.00");
  });
});
