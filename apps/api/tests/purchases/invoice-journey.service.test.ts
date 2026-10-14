import { testId } from "@cashier/shared/test-support";
import { describe, expect, it, vi } from "vitest";
import type { InvoiceJourneyRepository } from "../../src/modules/purchases/invoice-journey.repository.js";
import { InvoiceJourneyService } from "../../src/modules/purchases/invoice-journey.service.js";

const empty = { transfers: [], preparations: [], sales: [], losses: [] };

describe("InvoiceJourneyService", () => {
  it("404s a missing invoice", async () => {
    const service = new InvoiceJourneyService(
      { findById: vi.fn(async () => undefined) },
      {} as InvoiceJourneyRepository,
    );
    await expect(service.get(testId(1))).rejects.toMatchObject({ status: 404 });
  });

  it("adds item code, unit and unmatched sales to each line", async () => {
    const journey = {
      invoiceBatches: vi.fn(async () => [
        {
          id: testId(10),
          itemId: testId(5),
          itemName: "لبن",
          warehouse: "main",
          initialQuantity: "2.000",
          remainingQuantity: "2.000",
          unitCost: "30.000000",
        },
      ]),
      itemDetails: vi.fn(async () => [{ id: testId(5), code: 12, stockUnit: "لتر" }]),
      unmatchedSales: vi.fn(async () => new Map([[testId(5), "1.500"]])),
      outflows: vi.fn(async () => empty),
    } as unknown as InvoiceJourneyRepository;
    const service = new InvoiceJourneyService(
      { findById: vi.fn(async () => ({ id: testId(1) })) },
      journey,
    );

    const result = await service.get(testId(1));

    expect(result.invoiceId).toBe(testId(1));
    expect(result.totals).toMatchObject({ boughtCost: "60.00", mainStockCost: "60.00" });
    expect(result.lines).toEqual([
      expect.objectContaining({
        itemId: testId(5),
        itemCode: 12,
        itemName: "لبن",
        stockUnit: "لتر",
        boughtQuantity: "2.000",
        mainStockQuantity: "2.000",
        unmatchedSaleQuantity: "1.500",
      }),
    ]);
    expect(result.products).toEqual([]);
  });
});
