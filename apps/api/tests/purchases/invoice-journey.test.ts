import { describe, expect, it } from "vitest";
import {
  traceInvoice,
  type JourneyBatch,
  type JourneySource,
} from "../../src/modules/purchases/invoice-journey.js";

type SaleLine = {
  id: string;
  productName: string;
  sizeName: string | null;
  lineSubtotal: string;
  orderSubtotal: string;
  orderTotal: string;
  /** every allocation of the line: [allocationId, quantity, cost parts [qty, unitCost][]] */
  allocations: Array<[string, string, Array<[string, string]>]>;
};

/** In-memory stock graph. Every list is optional so a test states only what it uses. */
function source(graph: {
  batches: JourneyBatch[];
  transfers?: Array<[source: string, cafe: string, quantity: string]>;
  preparations?: Array<{
    id: string;
    outputBatchId: string;
    producedQuantity: string;
    allocations: Array<[source: string, quantity: string, unitCost: string]>;
  }>;
  sales?: Array<[batch: string, allocation: string, quantity: string]>;
  losses?: Array<[batch: string, kind: "waste" | "shortage", quantity: string]>;
  lines?: SaleLine[];
  refunds?: Array<[allocation: string, quantity: string, action: "return_to_stock" | "not_returnable", returnedBatch: string | null]>;
}): JourneySource {
  const has = (ids: string[], id: string) => ids.includes(id);
  return {
    async batches(ids) {
      return graph.batches.filter((batch) => has(ids, batch.id));
    },
    async outflows(ids) {
      return {
        transfers: (graph.transfers ?? [])
          .filter(([from]) => has(ids, from))
          .map(([sourceBatchId, cafeBatchId, quantity]) => ({ sourceBatchId, cafeBatchId, quantity })),
        preparations: (graph.preparations ?? []).flatMap((preparation) =>
          preparation.allocations
            .filter(([from]) => has(ids, from))
            .map(([sourceBatchId, quantity]) => ({
              sourceBatchId,
              preparationId: preparation.id,
              quantity,
            })),
        ),
        sales: (graph.sales ?? [])
          .filter(([batch]) => has(ids, batch))
          .map(([batchId, allocationId, quantity]) => ({ batchId, allocationId, quantity })),
        losses: (graph.losses ?? [])
          .filter(([batch]) => has(ids, batch))
          .map(([batchId, kind, quantity]) => ({ batchId, kind, quantity })),
      };
    },
    async preparations(ids) {
      return (graph.preparations ?? [])
        .filter((preparation) => has(ids, preparation.id))
        .map((preparation) => ({
          id: preparation.id,
          outputBatchId: preparation.outputBatchId,
          producedQuantity: preparation.producedQuantity,
          inputs: preparation.allocations.map(([, quantity, unitCost]) => ({ quantity, unitCost })),
        }));
    },
    async saleAllocations(ids) {
      return (graph.lines ?? []).flatMap((line) =>
        line.allocations
          .filter(([id]) => has(ids, id))
          .map(([allocationId, quantity]) => ({
            allocationId,
            quantity,
            line: {
              id: line.id,
              productName: line.productName,
              sizeName: line.sizeName,
              lineSubtotal: line.lineSubtotal,
              orderSubtotal: line.orderSubtotal,
              orderTotal: line.orderTotal,
              quantity: line.allocations
                .reduce((sum, [, allocated]) => sum + Number(allocated), 0)
                .toFixed(3),
              costParts: line.allocations.flatMap(([, , parts]) =>
                parts.map(([partQuantity, unitCost]) => ({ quantity: partQuantity, unitCost })),
              ),
            },
          })),
      );
    },
    async refunds(ids) {
      return (graph.refunds ?? [])
        .filter(([allocation]) => has(ids, allocation))
        .map(([allocationId, quantity, stockAction, returnedBatchId]) => ({
          allocationId,
          quantity,
          stockAction,
          returnedBatchId,
        }));
    },
  };
}

const batch = (
  id: string,
  itemId: string,
  warehouse: "main" | "cafe",
  initialQuantity: string,
  unitCost: string,
  remainingQuantity: string,
): JourneyBatch => ({
  id,
  itemId,
  itemName: itemId,
  warehouse,
  initialQuantity,
  remainingQuantity,
  unitCost,
});

const line = (
  id: string,
  revenue: string,
  allocations: SaleLine["allocations"],
  productName = "منتج",
): SaleLine => ({
  id,
  productName,
  sizeName: null,
  lineSubtotal: revenue,
  orderSubtotal: revenue,
  orderTotal: revenue,
  allocations,
});

describe("traceInvoice", () => {
  it("follows main stock through the cafe to sales, waste and what is left", async () => {
    const result = await traceInvoice(
      [batch("M", "milk", "main", "10.000", "2.000000", "4.000")],
      source({
        batches: [batch("C", "milk", "cafe", "6.000", "2.000000", "1.000")],
        transfers: [["M", "C", "6.000"]],
        sales: [["C", "A1", "4.000"]],
        losses: [["C", "waste", "1.000"]],
        lines: [line("L1", "40.00", [["A1", "4.000", [["4.000", "2.000000"]]]])],
      }),
    );

    expect(result.lines.get("milk")).toMatchObject({
      boughtQuantity: "10.000",
      boughtCost: "20.00",
      soldQuantity: "4.000",
      soldCost: "8.00",
      salesAmount: "40.00",
      refundedAmount: "0.00",
      profit: "32.00",
      wastedQuantity: "1.000",
      wastedCost: "2.00",
      mainStockQuantity: "4.000",
      mainStockCost: "8.00",
      cafeStockQuantity: "1.000",
      cafeStockCost: "2.00",
    });
    expect(result.totals.profit).toBe("32.00");
  });

  it("gives an ingredient its cost share of the sale price (latte example)", async () => {
    // 70 ml milk = 14, 30 ml coffee (another invoice) = 3; latte sold for 20
    const result = await traceInvoice(
      [batch("M", "milk", "main", "70.000", "0.200000", "0.000")],
      source({
        batches: [batch("C", "milk", "cafe", "70.000", "0.200000", "0.000")],
        transfers: [["M", "C", "70.000"]],
        sales: [["C", "A-milk", "70.000"]],
        lines: [
          line("L1", "20.00", [
            ["A-milk", "70.000", [["70.000", "0.200000"]]],
            ["A-coffee", "30.000", [["30.000", "0.100000"]]],
          ], "لاتيه"),
        ],
      }),
    );

    expect(result.lines.get("milk")).toMatchObject({
      soldCost: "14.00",
      salesAmount: "16.47",
      profit: "2.47",
    });
    expect(result.products).toEqual([
      expect.objectContaining({
        itemId: "milk",
        productName: "لاتيه",
        viaItemName: null,
        quantity: "70.000",
        salesAmount: "16.47",
      }),
    ]);
  });

  it("uses the price actually paid after an order discount", async () => {
    const result = await traceInvoice(
      [batch("C", "water", "cafe", "1.000", "4.000000", "0.000")],
      source({
        batches: [],
        sales: [["C", "A1", "1.000"]],
        lines: [
          {
            ...line("L1", "50.00", [["A1", "1.000", [["1.000", "4.000000"]]]]),
            orderSubtotal: "100.00",
            orderTotal: "80.00",
          },
        ],
      }),
    );

    expect(result.lines.get("water")).toMatchObject({ salesAmount: "40.00", profit: "36.00" });
  });

  it("follows an ingredient into a prepared item and its sales", async () => {
    // 2 kg sugar @10 → cafe; 1 kg + 1 kg other (@10) make 4 L syrup @5;
    // 2 L syrup sold alone for 30, 2 L left.
    const result = await traceInvoice(
      [batch("M", "sugar", "main", "2.000", "10.000000", "0.000")],
      source({
        batches: [
          batch("C", "sugar", "cafe", "2.000", "10.000000", "1.000"),
          { ...batch("P", "syrup", "cafe", "4.000", "5.000000", "2.000"), itemName: "شراب" },
        ],
        transfers: [["M", "C", "2.000"]],
        preparations: [
          {
            id: "PR",
            outputBatchId: "P",
            producedQuantity: "4.000",
            allocations: [["C", "1.000", "10.000000"], ["OTHER", "1.000", "10.000000"]],
          },
        ],
        sales: [["P", "A1", "2.000"]],
        lines: [line("L1", "30.00", [["A1", "2.000", [["2.000", "5.000000"]]]], "مشروب")],
      }),
    );

    expect(result.lines.get("sugar")).toMatchObject({
      soldQuantity: "0.500",
      soldCost: "5.00",
      salesAmount: "15.00",
      profit: "10.00",
      preparedStockQuantity: "0.500",
      preparedStockCost: "5.00",
      cafeStockQuantity: "1.000",
      cafeStockCost: "10.00",
    });
    expect(result.products).toEqual([
      expect.objectContaining({ productName: "مشروب", viaItemName: "شراب", quantity: "0.500" }),
    ]);
  });

  it("reverses refunded sales and follows refunded stock back onto the shelf", async () => {
    const result = await traceInvoice(
      [batch("C", "juice", "cafe", "4.000", "2.000000", "0.000")],
      source({
        batches: [batch("R", "juice", "cafe", "1.000", "2.000000", "1.000")],
        sales: [["C", "A1", "4.000"]],
        lines: [line("L1", "40.00", [["A1", "4.000", [["4.000", "2.000000"]]]])],
        refunds: [
          ["A1", "1.000", "return_to_stock", "R"],
          ["A1", "1.000", "not_returnable", null],
        ],
      }),
    );

    expect(result.lines.get("juice")).toMatchObject({
      soldQuantity: "2.000",
      soldCost: "4.00",
      salesAmount: "40.00",
      refundedAmount: "20.00",
      profit: "16.00",
      wastedQuantity: "1.000",
      wastedCost: "2.00",
      cafeStockQuantity: "1.000",
      cafeStockCost: "2.00",
    });
  });

  it("counts a sale made before stock arrived once this invoice's stock settled it", async () => {
    // the sale allocation has no batch; its deficit was settled by C
    const result = await traceInvoice(
      [batch("C", "cups", "cafe", "5.000", "1.000000", "2.000")],
      source({
        batches: [],
        sales: [["C", "A1", "3.000"]],
        lines: [line("L1", "9.00", [["A1", "3.000", [["3.000", "1.000000"]]]])],
      }),
    );

    expect(result.lines.get("cups")).toMatchObject({
      soldQuantity: "3.000",
      soldCost: "3.00",
      salesAmount: "9.00",
      cafeStockQuantity: "2.000",
    });
  });

  it("records stocktake shortages and keeps every bought pound accounted for", async () => {
    const result = await traceInvoice(
      [batch("M", "beans", "main", "3.000", "3.333333", "1.000")],
      source({
        batches: [],
        losses: [["M", "shortage", "2.000"]],
      }),
    );

    expect(result.lines.get("beans")).toMatchObject({
      shortageQuantity: "2.000",
      shortageCost: "6.67",
      mainStockCost: "3.33",
      boughtCost: "10.00",
    });
  });
});
