import { testId } from "@cashier/shared/test-support";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
  ExternalOrderSummary,
  PurchaseInvoiceDetail,
  StocktakeDetail,
  Supplier,
  SupplierStatementMovement,
} from "@cashier/shared";
import { formatMoney } from "@cashier/web-core/lib/format";
import { ExternalOrderSlip } from "../../../src/components/orders/external-order-slip";
import { PurchaseInvoiceSlip } from "../../../src/components/purchases/purchase-invoice-slip";
import { StocktakeCountSlip } from "../../../src/components/stocktakes/stocktake-count-slip";
import { SupplierStatementSlip } from "../../../src/components/suppliers/supplier-statement-slip";

const printable = (html: string) => {
  // Every slip uses the shared 80mm receipt page.
  expect(html).toContain("receipt-print-root");
};

describe("80mm print slips", () => {
  it("prints a supplier statement with its balances and movements", () => {
    const supplier = {
      id: testId(1),
      name: "مورد البن",
      phone: "01111111111",
      address: null,
      notes: null,
      openingBalance: "100.00",
      isActive: true,
      balance: "350.00",
    } satisfies Supplier;
    const movements: SupplierStatementMovement[] = [
      {
        id: "p1",
        type: "purchase",
        referenceId: testId(2),
        date: "2026-10-01",
        description: "فاتورة شراء INV-7",
        amount: "400.00",
        balanceAfter: "500.00",
      },
      {
        id: "m1",
        type: "payment",
        referenceId: testId(3),
        date: "2026-10-02",
        description: "دفعة نقدية",
        amount: "-150.00",
        balanceAfter: "350.00",
      },
    ];

    const html = renderToStaticMarkup(
      <SupplierStatementSlip
        supplier={supplier}
        movements={movements}
        purchasesTotal={400}
        paymentsTotal={150}
      />,
    );

    printable(html);
    expect(html).toContain("كشف حساب مورد");
    expect(html).toContain("مورد البن");
    expect(html).toContain("01111111111");
    expect(html).toContain("فاتورة شراء INV-7");
    expect(html).toContain("دفعة نقدية");
    expect(html).toContain("2026-10-02");
    expect(html).toContain(formatMoney("350.00"));
    expect(html).toContain("الرصيد المستحق");
  });

  it("prints a purchase invoice with its lines and what is still due", () => {
    const invoice = {
      id: testId(4),
      supplierId: testId(1),
      supplierName: "مورد البن",
      invoiceNumber: "INV-7",
      purchasedAt: "2026-10-01",
      notes: "تسليم صباحي",
      totalAmount: "400.00",
      paidAmount: "250.00",
      dueAmount: "150.00",
      createdBy: testId(5),
      createdByName: "أحمد",
      createdAt: "2026-10-01T08:00:00.000Z",
      transfers: [],
      lines: [
        {
          id: testId(6),
          itemId: testId(7),
          itemCode: 12,
          itemName: "بن محمص",
          quantity: "2.000",
          unitMode: "purchase",
          unitName: "كيس",
          stockQuantity: "2000.000",
          stockUnit: "جم",
          unitPrice: "200.00",
          unitCost: "0.20",
          lineTotal: "400.00",
          transferredToCafeQuantity: "0.000",
        },
      ],
    } satisfies PurchaseInvoiceDetail;

    const html = renderToStaticMarkup(<PurchaseInvoiceSlip invoice={invoice} />);

    printable(html);
    expect(html).toContain("فاتورة شراء");
    expect(html).toContain("INV-7");
    expect(html).toContain("مورد البن");
    expect(html).toContain("بن محمص");
    expect(html).toContain("كيس");
    expect(html).toContain(formatMoney("200.00"));
    expect(html).toContain(formatMoney("150.00"));
    expect(html).toContain("تسليم صباحي");
  });

  it("prints one online order without inventing item names", () => {
    const order = {
      id: 17,
      customerName: "عميل تجريبي",
      customerPhone: "01000000000",
      subtotal: "100.00",
      discountAmount: "5.00",
      totalAmount: "105.00",
      deliveryFee: "10.00",
      createdAt: "2026-08-17T19:30:00",
      orderStatus: "pending",
      paymentStatus: "unpaid",
      paymentMethod: "cash_on_delivery",
      orderType: "delivery",
      itemCount: 2,
    } satisfies ExternalOrderSummary;

    const html = renderToStaticMarkup(<ExternalOrderSlip order={order} />);

    printable(html);
    expect(html).toContain("طلب أونلاين");
    expect(html).toContain("#17");
    expect(html).toContain("عميل تجريبي");
    expect(html).toContain("01000000000");
    expect(html).toContain("توصيل");
    expect(html).toContain("الدفع عند الاستلام");
    expect(html).toContain("عدد الأصناف");
    expect(html).toContain(formatMoney("10.00"));
    expect(html).toContain(formatMoney("105.00"));
  });

  it("prints a count sheet with an empty space for every real count", () => {
    const stocktake = {
      id: testId(8),
      kind: "stocktake",
      warehouse: "main",
      categoryId: null,
      status: "draft",
      note: "جرد آخر الشهر",
      createdBy: testId(5),
      createdByName: "أحمد",
      createdAt: "2026-10-01T08:00:00.000Z",
      confirmedAt: null,
      lines: [
        {
          id: testId(9),
          itemId: testId(7),
          itemCode: 12,
          itemName: "بن محمص",
          stockUnit: "جم",
          recordedQuantity: "1500.000",
          countedQuantity: "1400.000",
          difference: "-100.000",
        },
      ],
    } satisfies StocktakeDetail;

    const html = renderToStaticMarkup(
      <StocktakeCountSlip stocktake={stocktake} />,
    );

    printable(html);
    expect(html).toContain("ورقة جرد");
    expect(html).toContain("المخزن الرئيسي");
    expect(html).toContain("جرد آخر الشهر");
    expect(html).toContain("بن محمص");
    expect(html).toContain("جم");
    expect(html).toContain('aria-label="الكمية الفعلية بن محمص"');
    // A sheet for counting by hand: a typed draft count is not pre-filled.
    expect(html).not.toContain("1400");
  });
});
