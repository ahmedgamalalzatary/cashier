import {
  branchCondition,
  branchValues,
  branchTable,
  branchTransaction,
} from "@cashier/db";
import { and, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm";
import type { Db } from "@cashier/db";
import {
  categories,
  items,
  orderLineAllocations,
  orderLines,
  orders,
  stockBatches,
  stockDeficitAllocations,
  stockMovements,
} from "@cashier/db";
import type { ItemType, Warehouse } from "@cashier/shared";
export type { Warehouse } from "@cashier/shared";

export type StockBatchRecord = {
  id: string;
  itemId: string;
  warehouse: Warehouse;
  initialQuantity: string;
  remainingQuantity: string;
  unitCost: string;
  receivedAt: Date;
  sourceType: string;
  sourceId: string | null;
};

export type StockMovementWrite = {
  itemId: string;
  warehouse: Warehouse;
  batchId: string | null;
  movementType: string;
  quantity: string;
  unitCost: string;
  referenceType: string | null;
  referenceId: string | null;
  notes: string | null;
  occurredAt: Date;
};

export type OutstandingDeficitRecord = {
  movementId: string;
  remainingQuantity: string;
};

export type StockDeficitAllocationWrite = {
  deficitMovementId: string;
  batchId: string;
  quantity: string;
  unitCost: string;
};

export interface InventoryRepositoryPort {
  transaction<T>(fn: (repo: InventoryRepositoryPort) => Promise<T>): Promise<T>;
  findItemForUpdate(id: string): Promise<
    | {
        id: string;
        isActive: boolean;
      }
    | undefined
  >;
  createBatch(data: Omit<StockBatchRecord, "id">): Promise<string>;
  createMovement(data: StockMovementWrite): Promise<string>;
  outstandingDeficits(
    itemId: string,
    warehouse: Warehouse,
  ): Promise<OutstandingDeficitRecord[]>;
  createDeficitAllocation(data: StockDeficitAllocationWrite): Promise<void>;
  /**
   * Sales made before stock existed were saved at cost 0 for the missing
   * part. Once these deficit movements are settled, recompute the cost of
   * the order lines and orders they belong to.
   */
  refreshSaleCosts(deficitMovementIds: string[]): Promise<void>;
  lockAvailableBatches(
    itemId: string,
    warehouse: Warehouse,
  ): Promise<StockBatchRecord[]>;
  updateBatchRemaining(id: string, remainingQuantity: string): Promise<void>;
  listStock(warehouse: Warehouse): Promise<InventoryStockRecord[]>;
}

export type InventoryStockRecord = {
  itemId: string;
  code: number;
  name: string;
  categoryId: string;
  categoryName: string;
  type: ItemType;
  stockUnit: string;
  isActive: boolean;
  quantity: string;
  stockValue: string;
  minimumLevel: string;
};

export class InventoryRepository implements InventoryRepositoryPort {
  constructor(private db: Db) {}

  transaction<T>(
    fn: (repo: InventoryRepositoryPort) => Promise<T>,
  ): Promise<T> {
    return branchTransaction(this.db, (tx) =>
      fn(new InventoryRepository(tx as unknown as Db)),
    );
  }

  async findItemForUpdate(id: string) {
    const [row] = await this.db
      .select({ id: items.id, isActive: items.isActive })
      .from(items)
      .where(branchCondition(items, eq(items.id, id)))
      .for("update");
    return row;
  }

  async createBatch(data: Omit<StockBatchRecord, "id">) {
    const [result] = await this.db
      .insert(stockBatches)
      .values(branchValues(data)).$returningId();
    return result.id;
  }

  async createMovement(data: StockMovementWrite) {
    const [result] = await this.db
      .insert(stockMovements)
      .values(branchValues(data)).$returningId();
    return result.id;
  }

  outstandingDeficits(itemId: string, warehouse: Warehouse) {
    const allocatedQuantity = sql<string>`COALESCE((
      SELECT SUM(sda.quantity)
      FROM ${branchTable("stock_deficit_allocations")} sda
      WHERE sda.deficit_movement_id = ${stockMovements.id}
    ), 0)`;
    const remainingQuantity = sql<string>`CAST(
      -${stockMovements.quantity} - ${allocatedQuantity}
      AS DECIMAL(14,3)
    )`;
    return this.db
      .select({ movementId: stockMovements.id, remainingQuantity })
      .from(stockMovements)
      .where(
        branchCondition(
          stockMovements,
          and(
            eq(stockMovements.itemId, itemId),
            eq(stockMovements.warehouse, warehouse),
            isNull(stockMovements.batchId),
            lt(stockMovements.quantity, "0"),
            sql`${remainingQuantity} > 0`,
          ),
        ),
      )
      .orderBy(stockMovements.occurredAt, stockMovements.id)
      .for("update");
  }

  async createDeficitAllocation(data: StockDeficitAllocationWrite) {
    await this.db.insert(stockDeficitAllocations).values(branchValues(data));
  }

  async refreshSaleCosts(deficitMovementIds: string[]) {
    const lines = await this.db
      .selectDistinct({
        id: orderLineAllocations.orderLineId,
        orderId: orderLines.orderId,
      })
      .from(orderLineAllocations)
      .innerJoin(
        orderLines,
        branchCondition(orderLines, eq(orderLines.id, orderLineAllocations.orderLineId)),
      )
      .where(
        branchCondition(
          orderLineAllocations,
          inArray(orderLineAllocations.stockMovementId, deficitMovementIds),
        ),
      );
    if (lines.length === 0) return;
    // batch parts carry their cost; deficit parts (cost 0) add what settled them
    await this.db
      .update(orderLines)
      .set({
        totalCost: sql`(
          SELECT CAST(ROUND(
            COALESCE(SUM(a.quantity * a.unit_cost), 0) +
            COALESCE((
              SELECT SUM(d.quantity * d.unit_cost)
              FROM ${branchTable("stock_deficit_allocations")} d
              WHERE d.deficit_movement_id IN (
                SELECT a2.stock_movement_id
                FROM ${branchTable("order_line_allocations")} a2
                WHERE a2.order_line_id = ${orderLines.id} AND a2.batch_id IS NULL
              )
            ), 0),
          2) AS DECIMAL(30,2))
          FROM ${branchTable("order_line_allocations")} a
          WHERE a.order_line_id = ${orderLines.id}
        )`,
      })
      .where(
        branchCondition(
          orderLines,
          inArray(orderLines.id, lines.map((line) => line.id)),
        ),
      );
    await this.db
      .update(orders)
      .set({
        totalCost: sql`(
          SELECT CAST(COALESCE(SUM(l.total_cost), 0) AS DECIMAL(30,2))
          FROM ${branchTable("order_lines")} l
          WHERE l.order_id = ${orders.id}
        )`,
      })
      .where(
        branchCondition(
          orders,
          inArray(orders.id, [...new Set(lines.map((line) => line.orderId))]),
        ),
      );
  }

  lockAvailableBatches(itemId: string, warehouse: Warehouse) {
    return this.db
      .select({
        id: stockBatches.id,
        itemId: stockBatches.itemId,
        warehouse: stockBatches.warehouse,
        initialQuantity: stockBatches.initialQuantity,
        remainingQuantity: stockBatches.remainingQuantity,
        unitCost: stockBatches.unitCost,
        receivedAt: stockBatches.receivedAt,
        sourceType: stockBatches.sourceType,
        sourceId: stockBatches.sourceId,
      })
      .from(stockBatches)
      .where(
        branchCondition(
          stockBatches,
          and(
            eq(stockBatches.itemId, itemId),
            eq(stockBatches.warehouse, warehouse),
            gt(stockBatches.remainingQuantity, "0"),
          ),
        ),
      )
      .orderBy(stockBatches.receivedAt, stockBatches.id)
      .for("update");
  }

  async updateBatchRemaining(id: string, remainingQuantity: string) {
    await this.db
      .update(stockBatches)
      .set({ remainingQuantity })
      .where(branchCondition(stockBatches, eq(stockBatches.id, id)));
  }

  listStock(warehouse: Warehouse) {
    const quantity = sql<string>`COALESCE((
      SELECT SUM(sm.quantity)
      FROM ${branchTable("stock_movements")} sm
      WHERE sm.item_id = items.id AND sm.warehouse = ${warehouse}
    ), 0)`;
    const stockValue = sql<string>`COALESCE((
      SELECT SUM(sb.remaining_quantity * sb.unit_cost)
      FROM ${branchTable("stock_batches")} sb
      WHERE sb.item_id = items.id AND sb.warehouse = ${warehouse}
    ), 0)`;
    const minimumLevel =
      warehouse === "main" ? items.mainMinimumLevel : items.cafeMinimumLevel;

    return this.db
      .select({
        itemId: items.id,
        code: items.code,
        name: items.name,
        categoryId: items.categoryId,
        categoryName: categories.name,
        type: items.type,
        stockUnit: items.stockUnit,
        isActive: items.isActive,
        quantity,
        stockValue,
        minimumLevel,
      })
      .from(items)
      .innerJoin(
        categories,
        branchCondition(categories, eq(items.categoryId, categories.id)),
      )
      .where(branchCondition(items))
      .orderBy(items.name);
  }
}
