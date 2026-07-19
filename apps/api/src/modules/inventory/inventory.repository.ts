import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import {
  categories,
  items,
  stockBatches,
  stockDeficitAllocations,
  stockMovements,
} from "../../db/schema.js";
import type { ItemType, Warehouse } from "@cashier/shared";
export type { Warehouse } from "@cashier/shared";

export type StockBatchRecord = {
  id: number;
  itemId: number;
  warehouse: Warehouse;
  initialQuantity: string;
  remainingQuantity: string;
  unitCost: string;
  receivedAt: Date;
  sourceType: string;
  sourceId: number | null;
};

export type StockMovementWrite = {
  itemId: number;
  warehouse: Warehouse;
  batchId: number | null;
  movementType: string;
  quantity: string;
  unitCost: string;
  referenceType: string | null;
  referenceId: number | null;
  notes: string | null;
  occurredAt: Date;
};

export type OutstandingDeficitRecord = {
  movementId: number;
  remainingQuantity: string;
};

export type StockDeficitAllocationWrite = {
  deficitMovementId: number;
  batchId: number;
  quantity: string;
  unitCost: string;
};

export interface InventoryRepositoryPort {
  transaction<T>(fn: (repo: InventoryRepositoryPort) => Promise<T>): Promise<T>;
  findItemForUpdate(id: number): Promise<
    | {
        id: number;
        isActive: boolean;
      }
    | undefined
  >;
  createBatch(data: Omit<StockBatchRecord, "id">): Promise<number>;
  createMovement(data: StockMovementWrite): Promise<number>;
  outstandingDeficits(
    itemId: number,
    warehouse: Warehouse,
  ): Promise<OutstandingDeficitRecord[]>;
  createDeficitAllocation(data: StockDeficitAllocationWrite): Promise<void>;
  lockAvailableBatches(
    itemId: number,
    warehouse: Warehouse,
  ): Promise<StockBatchRecord[]>;
  updateBatchRemaining(id: number, remainingQuantity: string): Promise<void>;
  listStock(warehouse: Warehouse): Promise<InventoryStockRecord[]>;
}

export type InventoryStockRecord = {
  itemId: number;
  name: string;
  categoryId: number;
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
    return this.db.transaction((tx) =>
      fn(new InventoryRepository(tx as unknown as Db)),
    );
  }

  async findItemForUpdate(id: number) {
    const [row] = await this.db
      .select({ id: items.id, isActive: items.isActive })
      .from(items)
      .where(eq(items.id, id))
      .for("update");
    return row;
  }

  async createBatch(data: Omit<StockBatchRecord, "id">) {
    const [result] = await this.db.insert(stockBatches).values(data);
    return result.insertId;
  }

  async createMovement(data: StockMovementWrite) {
    const [result] = await this.db.insert(stockMovements).values(data);
    return result.insertId;
  }

  outstandingDeficits(itemId: number, warehouse: Warehouse) {
    const allocatedQuantity = sql<string>`COALESCE((
      SELECT SUM(sda.quantity)
      FROM stock_deficit_allocations sda
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
        and(
          eq(stockMovements.itemId, itemId),
          eq(stockMovements.warehouse, warehouse),
          isNull(stockMovements.batchId),
          lt(stockMovements.quantity, "0"),
          sql`${remainingQuantity} > 0`,
        ),
      )
      .orderBy(stockMovements.occurredAt, stockMovements.id);
  }

  async createDeficitAllocation(data: StockDeficitAllocationWrite) {
    await this.db.insert(stockDeficitAllocations).values(data);
  }

  lockAvailableBatches(itemId: number, warehouse: Warehouse) {
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
        and(
          eq(stockBatches.itemId, itemId),
          eq(stockBatches.warehouse, warehouse),
          gt(stockBatches.remainingQuantity, "0"),
        ),
      )
      .orderBy(stockBatches.receivedAt, stockBatches.id)
      .for("update");
  }

  async updateBatchRemaining(id: number, remainingQuantity: string) {
    await this.db
      .update(stockBatches)
      .set({ remainingQuantity })
      .where(eq(stockBatches.id, id));
  }

  listStock(warehouse: Warehouse) {
    const quantity = sql<string>`COALESCE((
      SELECT SUM(sm.quantity)
      FROM stock_movements sm
      WHERE sm.item_id = items.id AND sm.warehouse = ${warehouse}
    ), 0)`;
    const stockValue = sql<string>`COALESCE((
      SELECT SUM(sb.remaining_quantity * sb.unit_cost)
      FROM stock_batches sb
      WHERE sb.item_id = items.id AND sb.warehouse = ${warehouse}
    ), 0)`;
    const minimumLevel =
      warehouse === "main" ? items.mainMinimumLevel : items.cafeMinimumLevel;

    return this.db
      .select({
        itemId: items.id,
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
      .innerJoin(categories, eq(items.categoryId, categories.id))
      .orderBy(items.name);
  }
}
