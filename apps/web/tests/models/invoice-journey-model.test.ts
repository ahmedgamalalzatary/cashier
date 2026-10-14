import { describe, expect, it } from "vitest";
import type { InvoiceJourneyMoney } from "@cashier/shared";
import { journeyCostSegments } from "../../src/models/invoice-journey-model";

const totals = (overrides: Partial<InvoiceJourneyMoney>): InvoiceJourneyMoney => ({
  boughtCost: "0.00",
  soldCost: "0.00",
  salesAmount: "0.00",
  refundedAmount: "0.00",
  profit: "0.00",
  wastedCost: "0.00",
  shortageCost: "0.00",
  mainStockCost: "0.00",
  cafeStockCost: "0.00",
  preparedStockCost: "0.00",
  ...overrides,
});

describe("invoice journey cost segments", () => {
  it("splits the bought cost into where it went, skipping empty parts", () => {
    expect(
      journeyCostSegments(
        totals({
          boughtCost: "40.00",
          soldCost: "12.00",
          wastedCost: "4.00",
          mainStockCost: "16.00",
          cafeStockCost: "8.00",
        }),
      ),
    ).toEqual([
      { key: "sold", label: "مُباع", cost: "12.00", percent: 30 },
      { key: "wasted", label: "هالك", cost: "4.00", percent: 10 },
      { key: "mainStock", label: "بالمخزن الرئيسي", cost: "16.00", percent: 40 },
      { key: "cafeStock", label: "بالكافيه", cost: "8.00", percent: 20 },
    ]);
  });

  it("returns nothing for an invoice with no cost", () => {
    expect(journeyCostSegments(totals({}))).toEqual([]);
  });
});
