import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import type { Db } from "@cashier/db";
import {
  branchCondition,
  items,
  orderLineAllocations,
  orderLines,
  orders,
  preparationAllocations,
  preparations,
  refundLineAllocations,
  refundLines,
  stockBatches,
  stockDeficitAllocations,
  stockMovements,
  transferLines,
} from "@cashier/db";
import type {
  JourneyBatch,
  JourneyOutflows,
  JourneyPreparation,
  JourneyRefund,
  JourneySaleAllocation,
  JourneySource,
} from "./invoice-journey.js";

const batchColumns = {
  id: stockBatches.id,
  itemId: stockBatches.itemId,
  itemName: items.name,
  warehouse: stockBatches.warehouse,
  initialQuantity: stockBatches.initialQuantity,
  remainingQuantity: stockBatches.remainingQuantity,
  unitCost: stockBatches.unitCost,
};

/** Read-only queries behind the invoice journey. */
export class InvoiceJourneyRepository implements JourneySource {
  constructor(private db: Db) {}

  /** The main-warehouse batches the invoice's lines were received into. */
  invoiceBatches(invoiceId: string): Promise<JourneyBatch[]> {
    return this.db
      .select(batchColumns)
      .from(stockBatches)
      .innerJoin(items, branchCondition(items, eq(items.id, stockBatches.itemId)))
      .where(
        branchCondition(
          stockBatches,
          and(
            eq(stockBatches.sourceType, "purchase"),
            eq(stockBatches.sourceId, invoiceId),
          ),
        ),
      )
      .orderBy(stockBatches.id);
  }

  itemDetails(ids: string[]) {
    return this.db
      .select({ id: items.id, code: items.code, stockUnit: items.stockUnit })
      .from(items)
      .where(branchCondition(items, inArray(items.id, ids)));
  }

  /** Cafe sales of these items still waiting for stock to be matched. */
  async unmatchedSales(itemIds: string[]) {
    const settled = sql<string>`COALESCE((
      SELECT SUM(sda.quantity) FROM ${stockDeficitAllocations} sda
      WHERE sda.branch_id = ${stockMovements.branchId}
        AND sda.deficit_movement_id = ${stockMovements.id}
    ), 0)`;
    const rows = await this.db
      .select({
        itemId: stockMovements.itemId,
        quantity: sql<string>`CAST(SUM(-${stockMovements.quantity} - ${settled}) AS DECIMAL(14,3))`,
      })
      .from(stockMovements)
      .where(
        branchCondition(
          stockMovements,
          and(
            inArray(stockMovements.itemId, itemIds),
            eq(stockMovements.warehouse, "cafe"),
            eq(stockMovements.movementType, "sale"),
            isNull(stockMovements.batchId),
          ),
        ),
      )
      .groupBy(stockMovements.itemId);
    return new Map(rows.map((row) => [row.itemId, row.quantity]));
  }

  batches(ids: string[]): Promise<JourneyBatch[]> {
    return this.db
      .select(batchColumns)
      .from(stockBatches)
      .innerJoin(items, branchCondition(items, eq(items.id, stockBatches.itemId)))
      .where(branchCondition(stockBatches, inArray(stockBatches.id, ids)));
  }

  async outflows(ids: string[]): Promise<JourneyOutflows> {
    const [transferRows, preparationRows, sold, lost, settled] =
      await Promise.all([
      this.db
        .select({
          sourceBatchId: transferLines.sourceBatchId,
          cafeBatchId: transferLines.cafeBatchId,
          quantity: transferLines.quantity,
        })
        .from(transferLines)
        .where(branchCondition(transferLines, inArray(transferLines.sourceBatchId, ids))),
      this.db
        .select({
          sourceBatchId: preparationAllocations.sourceBatchId,
          preparationId: preparationAllocations.preparationId,
          quantity: preparationAllocations.quantity,
        })
        .from(preparationAllocations)
        .where(
          branchCondition(
            preparationAllocations,
            inArray(preparationAllocations.sourceBatchId, ids),
          ),
        ),
      this.db
        .select({
          batchId: orderLineAllocations.batchId,
          allocationId: orderLineAllocations.id,
          quantity: orderLineAllocations.quantity,
        })
        .from(orderLineAllocations)
        .where(branchCondition(orderLineAllocations, inArray(orderLineAllocations.batchId, ids))),
      this.db
        .select({
          batchId: stockMovements.batchId,
          movementType: stockMovements.movementType,
          quantity: sql<string>`CAST(-${stockMovements.quantity} AS DECIMAL(14,3))`,
        })
        .from(stockMovements)
        .where(
          branchCondition(
            stockMovements,
            and(
              inArray(stockMovements.batchId, ids),
              inArray(stockMovements.movementType, ["waste", "stocktake_shortage"]),
              lt(stockMovements.quantity, "0"),
            ),
          ),
        ),
      // Sales, shortages, transfers and preparations made before stock arrived,
      // settled later by these batches. A settled deficit is followed into the
      // batch the missing stock should have landed in: the cafe batch a transfer
      // created, or the output batch a preparation produced.
      this.db
        .select({
          batchId: stockDeficitAllocations.batchId,
          quantity: stockDeficitAllocations.quantity,
          movementType: stockMovements.movementType,
          allocationId: orderLineAllocations.id,
          cafeBatchId: transferLines.cafeBatchId,
          preparationId: preparationAllocations.preparationId,
        })
        .from(stockDeficitAllocations)
        .innerJoin(
          stockMovements,
          branchCondition(
            stockMovements,
            eq(stockMovements.id, stockDeficitAllocations.deficitMovementId),
          ),
        )
        .leftJoin(
          orderLineAllocations,
          branchCondition(
            orderLineAllocations,
            eq(orderLineAllocations.stockMovementId, stockMovements.id),
          ),
        )
        .leftJoin(
          transferLines,
          branchCondition(
            transferLines,
            and(
              eq(transferLines.transferId, stockMovements.referenceId),
              isNull(transferLines.sourceBatchId),
              eq(transferLines.itemId, stockMovements.itemId),
              eq(transferLines.quantity, sql`-${stockMovements.quantity}`),
            ),
          ),
        )
        .leftJoin(
          preparationAllocations,
          branchCondition(
            preparationAllocations,
            and(
              eq(preparationAllocations.preparationId, stockMovements.referenceId),
              isNull(preparationAllocations.sourceBatchId),
              eq(
                preparationAllocations.ingredientItemId,
                stockMovements.itemId,
              ),
              eq(preparationAllocations.quantity, sql`-${stockMovements.quantity}`),
            ),
          ),
        )
        .where(
          branchCondition(
            stockDeficitAllocations,
            inArray(stockDeficitAllocations.batchId, ids),
          ),
        ),
    ]);

    const transfers: JourneyOutflows["transfers"] = transferRows.map((row) => ({
      sourceBatchId: row.sourceBatchId,
      cafeBatchId: row.cafeBatchId,
      quantity: row.quantity,
    }));
    const preparations: JourneyOutflows["preparations"] = preparationRows.map(
      (row) => ({
        sourceBatchId: row.sourceBatchId,
        preparationId: row.preparationId,
        quantity: row.quantity,
      }),
    );
    const sales: JourneyOutflows["sales"] = sold.map((row) => ({
      batchId: row.batchId!,
      allocationId: row.allocationId,
      quantity: row.quantity,
    }));
    const losses: JourneyOutflows["losses"] = lost.map((row) => ({
      batchId: row.batchId!,
      kind: row.movementType === "waste" ? "waste" : "shortage",
      quantity: row.quantity,
    }));
    for (const row of settled) {
      if (row.movementType === "sale" && row.allocationId) {
        sales.push({ batchId: row.batchId, allocationId: row.allocationId, quantity: row.quantity });
      } else if (row.movementType === "stocktake_shortage") {
        losses.push({ batchId: row.batchId, kind: "shortage", quantity: row.quantity });
      } else if (row.movementType === "transfer_out" && row.cafeBatchId) {
        // The incoming stock replaced a transfer that had taken main below
        // zero; follow it into the cafe batch that transfer had already filled.
        transfers.push({
          sourceBatchId: row.batchId,
          cafeBatchId: row.cafeBatchId,
          quantity: row.quantity,
        });
      } else if (row.movementType === "preparation_out" && row.preparationId) {
        // Same idea for an ingredient a preparation used before it arrived:
        // follow it into the preparation's output batch.
        preparations.push({
          sourceBatchId: row.batchId,
          preparationId: row.preparationId,
          quantity: row.quantity,
        });
      } else {
        throw new Error(`unexpected settled stock deficit: ${row.movementType}`);
      }
    }
    return { transfers, preparations, sales, losses };
  }

  async preparations(ids: string[]): Promise<JourneyPreparation[]> {
    const [headers, inputs] = await Promise.all([
      this.db
        .select({
          id: preparations.id,
          outputBatchId: preparations.outputBatchId,
          producedQuantity: preparations.producedQuantity,
        })
        .from(preparations)
        .where(branchCondition(preparations, inArray(preparations.id, ids))),
      this.db
        .select({
          preparationId: preparationAllocations.preparationId,
          quantity: preparationAllocations.quantity,
          unitCost: preparationAllocations.unitCost,
        })
        .from(preparationAllocations)
        .where(
          branchCondition(
            preparationAllocations,
            inArray(preparationAllocations.preparationId, ids),
          ),
        ),
    ]);
    return headers.map((header) => {
      if (!header.outputBatchId) {
        throw new Error(`preparation ${header.id} has no output batch`);
      }
      return {
        id: header.id,
        outputBatchId: header.outputBatchId,
        producedQuantity: header.producedQuantity,
        inputs: inputs
          .filter((input) => input.preparationId === header.id)
          .map(({ quantity, unitCost }) => ({ quantity, unitCost })),
      };
    });
  }

  async saleAllocations(ids: string[]): Promise<JourneySaleAllocation[]> {
    const requested = await this.db
      .select({
        id: orderLineAllocations.id,
        orderLineId: orderLineAllocations.orderLineId,
        quantity: orderLineAllocations.quantity,
      })
      .from(orderLineAllocations)
      .where(branchCondition(orderLineAllocations, inArray(orderLineAllocations.id, ids)));
    const lineIds = [...new Set(requested.map((row) => row.orderLineId))];
    if (lineIds.length === 0) return [];

    const [lines, allocations] = await Promise.all([
      this.db
        .select({
          id: orderLines.id,
          productName: orderLines.productName,
          sizeName: orderLines.sizeName,
          lineSubtotal: orderLines.lineSubtotal,
          orderSubtotal: orders.subtotal,
          orderTotal: orders.total,
        })
        .from(orderLines)
        .innerJoin(orders, branchCondition(orders, eq(orders.id, orderLines.orderId)))
        .where(branchCondition(orderLines, inArray(orderLines.id, lineIds))),
      this.db
        .select({
          orderLineId: orderLineAllocations.orderLineId,
          batchId: orderLineAllocations.batchId,
          stockMovementId: orderLineAllocations.stockMovementId,
          quantity: orderLineAllocations.quantity,
          unitCost: orderLineAllocations.unitCost,
        })
        .from(orderLineAllocations)
        .where(
          branchCondition(orderLineAllocations, inArray(orderLineAllocations.orderLineId, lineIds)),
        ),
    ]);
    const deficitMovementIds = allocations
      .filter((row) => row.batchId === null)
      .map((row) => row.stockMovementId);
    const settled =
      deficitMovementIds.length === 0
        ? []
        : await this.db
            .select({
              deficitMovementId: stockDeficitAllocations.deficitMovementId,
              quantity: stockDeficitAllocations.quantity,
              unitCost: stockDeficitAllocations.unitCost,
            })
            .from(stockDeficitAllocations)
            .where(
              branchCondition(
                stockDeficitAllocations,
                inArray(stockDeficitAllocations.deficitMovementId, deficitMovementIds),
              ),
            );

    const lineById = new Map(
      lines.map((line) => {
        const own = allocations.filter((row) => row.orderLineId === line.id);
        const costParts = own.flatMap((row) =>
          row.batchId !== null
            ? [{ quantity: row.quantity, unitCost: row.unitCost }]
            : settled
                .filter((part) => part.deficitMovementId === row.stockMovementId)
                .map(({ quantity, unitCost }) => ({ quantity, unitCost })),
        );
        return [
          line.id,
          { ...line, quantity: sumQuantities(own.map((row) => row.quantity)), costParts },
        ];
      }),
    );
    return requested.map((row) => {
      const line = lineById.get(row.orderLineId);
      if (!line) throw new Error(`order line ${row.orderLineId} not found`);
      return { allocationId: row.id, quantity: row.quantity, line };
    });
  }

  async refunds(ids: string[]): Promise<JourneyRefund[]> {
    const rows = await this.db
      .select({
        allocationId: refundLineAllocations.orderLineAllocationId,
        quantity: refundLineAllocations.quantity,
        stockAction: refundLines.stockAction,
        returnedBatchId: refundLineAllocations.returnedBatchId,
      })
      .from(refundLineAllocations)
      .innerJoin(
        refundLines,
        branchCondition(refundLines, eq(refundLines.id, refundLineAllocations.refundLineId)),
      )
      .where(
        branchCondition(
          refundLineAllocations,
          inArray(refundLineAllocations.orderLineAllocationId, ids),
        ),
      );
    return rows.map((row) => ({
      ...row,
      stockAction: row.stockAction === "return_to_stock" ? "return_to_stock" : "not_returnable",
    }));
  }
}

/** Exact sum of DECIMAL(14,3) quantity strings. */
function sumQuantities(values: string[]) {
  const milli = values.reduce((sum, value) => {
    const [whole = "0", fraction = ""] = value.split(".");
    return sum + BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0").slice(0, 3));
  }, 0n);
  return `${milli / 1000n}.${(milli % 1000n).toString().padStart(3, "0")}`;
}
