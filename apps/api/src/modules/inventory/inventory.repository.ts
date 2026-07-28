import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import {
  categories,
  categoryColors,
  categorySizes,
  items,
  products,
  stockBatches,
  stockDeficitAllocations,
  stockMovements,
} from "../../db/schema.js";
import type { Warehouse } from "@cashier/shared";
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
  variantId: number;
  code: number;
  barcode: string | null;
  productName: string;
  colorName: string;
  sizeName: string;
  categoryId: number;
  categoryName: string;
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
      .orderBy(stockMovements.occurredAt, stockMovements.id)
      .for("update");
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
      WHERE sm.variant_id = ${items.id} AND sm.warehouse = ${warehouse}
    ), 0)`;
    const stockValue = sql<string>`COALESCE((
      SELECT SUM(sb.remaining_quantity * sb.unit_cost)
      FROM stock_batches sb
      WHERE sb.variant_id = ${items.id} AND sb.warehouse = ${warehouse}
    ), 0)`;
    const minimumLevel =
      warehouse === "main" ? items.mainMinimumLevel : items.shopMinimumLevel;

    return this.db
      .select({
        variantId: items.id,
        itemId: items.id,
        code: items.code,
        barcode: items.barcode,
        productName: products.name,
        name: sql<string>`CONCAT(${products.name}, ' - ', ${categoryColors.name}, ' - ', ${categorySizes.name})`,
        colorName: categoryColors.name,
        sizeName: categorySizes.name,
        categoryId: products.categoryId,
        categoryName: categories.name,
        type: sql<"product">`'product'`,
        stockUnit: sql<"قطعة">`'قطعة'`,
        isActive: sql<boolean>`${items.isActive} AND ${products.isActive}`,
        quantity,
        stockValue,
        minimumLevel,
      })
      .from(items)
      .innerJoin(products, eq(items.productId, products.id))
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .innerJoin(categoryColors, eq(items.colorId, categoryColors.id))
      .innerJoin(categorySizes, eq(items.sizeId, categorySizes.id))
      .orderBy(products.name, categoryColors.name, categorySizes.name);
  }
}
