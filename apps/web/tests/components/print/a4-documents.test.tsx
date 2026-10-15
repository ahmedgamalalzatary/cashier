import { testId } from "@cashier/shared/test-support";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
  PreparedRecipe,
  PurchaseInvoiceDetail,
  StocktakeDetail,
  Supplier,
  SupplierStatementMovement,
} from "@cashier/shared";
import { cairoCalendarDate } from "@cashier/web-core/lib/cairo-date";
import { formatMoney } from "@cashier/web-core/lib/format";
import { A4Document } from "../../../src/components/print/a4-document";
import { PurchaseInvoiceSlip } from "../../../src/components/purchases/purchase-invoice-slip";
import { StocktakeCountSlip } from "../../../src/components/stocktakes/stocktake-count-slip";
import { SupplierStatementSlip } from "../../../src/components/suppliers/supplier-statement-slip";
import { CostCardDocument } from "../../../src/components/recipes/cost-card-document";

/** Every A4 document uses the shared page and never the 80mm receipt page. */
const printable = (html: string) => {
  expect(html).toContain("a4-print-root");
  expect(html).not.toContain("receipt-print-root");
};

describe("shared A4 document layout", () => {
  it("prints the shop name, the title and the Cairo date", () => {
    const html = renderToStaticMarkup(
      <A4Document title="فاتورة شراء" label="اختبار">
        <p>محتوى</p>
      </A4Document>,
    );

    printable(html);
    expect(html).toContain("الكافيه");
    expect(html).toContain("فاتورة شراء");
    expect(html).toContain(cairoCalendarDate());
  });

  it("shows facts, totals and signature lines when given", () => {
    const html = renderToStaticMarkup(
      <A4Document
        title="مستند"
        label="اختبار"
        facts={[
          ["المورد", "مورد البن"],
          ["الهاتف", null],
        ]}
        totals={[["الإجمالي", formatMoney("100.00"), true]]}
        signatures={["المُسلِّم", "المُستلِم"]}
      >
        <p>محتوى</p>
      </A4Document>,
    );

    expect(html).toContain("مورد البن");
    expect(html).not.toContain("الهاتف");
    expect(html).toContain("الإجمالي");
    expect(html).toContain("المُسلِّم");
    expect(html).toContain("المُستلِم");
  });
});

describe("A4 print documents", () => {
  it("prints a purchase invoice as an A4 page with its lines and what is due", () => {
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
      hasStockToTransfer: false,
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

  it("prints a supplier statement as an A4 page with its balances and movements", () => {
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

  it("prints a count sheet as an A4 page with an empty counted column", () => {
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
    expect(html).toContain("المعدود");
    expect(html).toContain('aria-label="الكمية الفعلية بن محمص"');
    // A sheet for counting by hand: a typed draft count is not pre-filled.
    expect(html).not.toContain("1400");
    expect(html).toContain("اسم القائم بالعد");
  });

  it("prints a recipe cost card as an A4 page", () => {
    const recipe = {
      id: testId(10),
      type: "prepared",
      name: "لاتيه",
      categoryId: testId(11),
      categoryName: "مشروبات",
      isActive: true,
      createdAt: "2026-10-01T08:00:00.000Z",
      updatedAt: "2026-10-01T08:00:00.000Z",
      outputItemId: testId(12),
      outputItemName: "لاتيه",
      outputStockUnit: "كوب",
      baseYield: "1.000",
      currentCost: "12.00",
      estimatedUnitCost: "12.00",
      hasSufficientStock: true,
      ingredients: [
        {
          id: testId(13),
          itemId: testId(14),
          itemCode: 20,
          itemName: "بن",
          itemType: "raw",
          stockUnit: "جم",
          requiredQuantity: "18.000",
          availableQuantity: "1000.000",
          currentCost: "10.00",
          costSource: "cafe",
          hasSufficientStock: true,
          itemIsActive: true,
        },
      ],
    } satisfies PreparedRecipe;

    const html = renderToStaticMarkup(<CostCardDocument recipe={recipe} />);

    printable(html);
    expect(html).toContain("بطاقة التكلفة");
    expect(html).toContain("لاتيه");
    expect(html).toContain("بن");
    expect(html).toContain(formatMoney("12.00"));
  });
});
