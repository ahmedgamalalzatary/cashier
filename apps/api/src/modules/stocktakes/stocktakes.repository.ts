import { and, asc, desc, eq, or, sql } from "drizzle-orm";
import type { Warehouse } from "@cashier/shared";
import type { Db } from "../../db/index.js";
import {
  categories,
  items,
  stocktakeLines,
  stocktakes,
  users,
} from "../../db/schema.js";
import { InventoryRepository } from "../inventory/inventory.repository.js";
import { InventoryTransaction } from "../inventory/inventory.service.js";
import { HttpError } from "../../middleware/error.js";

export type StocktakeSessionRecord = {
  id: number;
  warehouse: Warehouse;
  status: "draft" | "confirmed";
  createdBy: number;
};
export type StocktakeLineRecord = {
  id: number;
  itemId: number;
  recordedQuantity: string;
  countedQuantity: string | null;
};
export type StocktakeSnapshot = { itemId: number; recordedQuantity: string };

export interface StocktakesRepositoryPort {
  transaction<T>(
    fn: (repo: StocktakesRepositoryPort) => Promise<T>,
  ): Promise<T>;
  createSession(data: {
    warehouse: Warehouse;
    categoryId: number | null;
    note: string | null;
    createdBy: number;
    kind?: "stocktake" | "manual";
  }): Promise<number>;
  snapshotItems(
    warehouse: Warehouse,
    categoryId: number | null,
  ): Promise<StocktakeSnapshot[]>;
  createLines(stocktakeId: number, rows: StocktakeSnapshot[]): Promise<void>;
  findSessionForUpdate(id: number): Promise<StocktakeSessionRecord | undefined>;
  listLinesForUpdate(id: number): Promise<StocktakeLineRecord[]>;
  updateCounts(
    id: number,
    lines: Array<{ itemId: number; countedQuantity: number }>,
  ): Promise<void>;
  currentQuantity(itemId: number, warehouse: Warehouse): Promise<string>;
  currentFifoCost(itemId: number, warehouse: Warehouse): Promise<string>;
  markConfirmed(id: number, note: string): Promise<void>;
  detail(id: number): Promise<unknown>;
  list(): Promise<unknown[]>;
  createManualSession(data: {
    warehouse: Warehouse;
    note: string;
    createdBy: number;
  }): Promise<number>;
  createManualLine(data: {
    stocktakeId: number;
    itemId: number;
    recordedQuantity: string;
    countedQuantity: string;
  }): Promise<void>;
  receive(input: Record<string, unknown>): Promise<unknown>;
  consume(input: Record<string, unknown>): Promise<unknown>;
}

export class StocktakesRepository implements StocktakesRepositoryPort {
  private inventory: InventoryTransaction;
  constructor(private db: Db) {
    this.inventory = new InventoryTransaction(new InventoryRepository(db));
  }

  transaction<T>(
    fn: (repo: StocktakesRepositoryPort) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction((tx) =>
      fn(new StocktakesRepository(tx as unknown as Db)),
    );
  }
  async createSession(data: {
    warehouse: Warehouse;
    categoryId: number | null;
    note: string | null;
    createdBy: number;
    kind?: "stocktake" | "manual";
  }) {
    const [result] = await this.db
      .insert(stocktakes)
      .values({ ...data, kind: data.kind ?? "stocktake" });
    return result.insertId;
  }
  snapshotItems(warehouse: Warehouse, categoryId: number | null) {
    const recordedQuantity = sql<string>`CAST(COALESCE((SELECT SUM(sm.quantity) FROM stock_movements sm WHERE sm.item_id=${items.id} AND sm.warehouse=${warehouse}),0) AS DECIMAL(14,3))`;
    return this.db
      .select({ itemId: items.id, recordedQuantity })
      .from(items)
      .leftJoin(categories, eq(categories.id, items.categoryId))
      .where(
        categoryId === null
          ? eq(items.isActive, true)
          : and(
              eq(items.isActive, true),
              or(
                eq(items.categoryId, categoryId),
                eq(categories.parentId, categoryId),
              ),
            ),
      )
      .orderBy(asc(items.id));
  }
  async createLines(stocktakeId: number, rows: StocktakeSnapshot[]) {
    if (rows.length)
      await this.db
        .insert(stocktakeLines)
        .values(rows.map((row) => ({ stocktakeId, ...row })));
  }
  async findSessionForUpdate(id: number) {
    const [row] = await this.db
      .select({
        id: stocktakes.id,
        warehouse: stocktakes.warehouse,
        status: stocktakes.status,
        createdBy: stocktakes.createdBy,
      })
      .from(stocktakes)
      .where(eq(stocktakes.id, id))
      .for("update");
    return row;
  }
  listLinesForUpdate(id: number) {
    return this.db
      .select({
        id: stocktakeLines.id,
        itemId: stocktakeLines.itemId,
        recordedQuantity: stocktakeLines.recordedQuantity,
        countedQuantity: stocktakeLines.countedQuantity,
      })
      .from(stocktakeLines)
      .where(eq(stocktakeLines.stocktakeId, id))
      .orderBy(asc(stocktakeLines.itemId))
      .for("update");
  }
  async updateCounts(
    id: number,
    lines: Array<{ itemId: number; countedQuantity: number }>,
  ) {
    for (const line of lines) {
      const [result] = await this.db
        .update(stocktakeLines)
        .set({ countedQuantity: line.countedQuantity.toFixed(3) })
        .where(
          and(
            eq(stocktakeLines.stocktakeId, id),
            eq(stocktakeLines.itemId, line.itemId),
          ),
        );
      if (result.affectedRows !== 1)
        throw new Error("STOCKTAKE_LINE_NOT_FOUND");
    }
  }
  async currentQuantity(itemId: number, warehouse: Warehouse) {
    const item = await new InventoryRepository(this.db).findItemForUpdate(
      itemId,
    );
    if (!item) throw new HttpError(404, "الصنف غير موجود");
    if (!item.isActive) throw new HttpError(409, "الصنف موقوف");
    const [row] = await this.db.execute(
      sql`SELECT CAST(COALESCE(SUM(quantity),0) AS DECIMAL(14,3)) quantity FROM stock_movements WHERE item_id=${itemId} AND warehouse=${warehouse}`,
    );
    return String(
      (row as unknown as Array<{ quantity: string }>)[0]?.quantity ?? "0.000",
    );
  }
  async currentFifoCost(itemId: number, warehouse: Warehouse) {
    const [row] = await this.db.execute(
      sql`SELECT unit_cost unitCost FROM stock_batches WHERE item_id=${itemId} AND warehouse=${warehouse} AND remaining_quantity>0 ORDER BY received_at,id LIMIT 1`,
    );
    return String(
      (row as unknown as Array<{ unitCost: string }>)[0]?.unitCost ??
        "0.000000",
    );
  }
  async markConfirmed(id: number, note: string) {
    await this.db
      .update(stocktakes)
      .set({ status: "confirmed", note, confirmedAt: new Date() })
      .where(eq(stocktakes.id, id));
  }
  async detail(id: number) {
    const [header] = await this.db
      .select({
        id: stocktakes.id,
        kind: stocktakes.kind,
        warehouse: stocktakes.warehouse,
        categoryId: stocktakes.categoryId,
        status: stocktakes.status,
        note: stocktakes.note,
        createdBy: stocktakes.createdBy,
        createdByName: users.name,
        createdAt: stocktakes.createdAt,
        confirmedAt: stocktakes.confirmedAt,
      })
      .from(stocktakes)
      .innerJoin(users, eq(users.id, stocktakes.createdBy))
      .where(eq(stocktakes.id, id));
    if (!header) return undefined;
    const lines = await this.db
      .select({
        id: stocktakeLines.id,
        itemId: stocktakeLines.itemId,
        itemCode: items.code,
        itemName: items.name,
        stockUnit: items.stockUnit,
        recordedQuantity: stocktakeLines.recordedQuantity,
        countedQuantity: stocktakeLines.countedQuantity,
        difference: sql<
          string | null
        >`CASE WHEN ${stocktakeLines.countedQuantity} IS NULL THEN NULL ELSE CAST(${stocktakeLines.countedQuantity}-${stocktakeLines.recordedQuantity} AS DECIMAL(14,3)) END`,
      })
      .from(stocktakeLines)
      .innerJoin(items, eq(items.id, stocktakeLines.itemId))
      .where(eq(stocktakeLines.stocktakeId, id))
      .orderBy(asc(items.name));
    return { ...header, lines };
  }
  list() {
    return this.db
      .select({
        id: stocktakes.id,
        kind: stocktakes.kind,
        warehouse: stocktakes.warehouse,
        categoryId: stocktakes.categoryId,
        status: stocktakes.status,
        note: stocktakes.note,
        createdBy: stocktakes.createdBy,
        createdByName: users.name,
        createdAt: stocktakes.createdAt,
        confirmedAt: stocktakes.confirmedAt,
        lineCount: sql<number>`COUNT(${stocktakeLines.id})`,
      })
      .from(stocktakes)
      .innerJoin(users, eq(users.id, stocktakes.createdBy))
      .leftJoin(stocktakeLines, eq(stocktakeLines.stocktakeId, stocktakes.id))
      .groupBy(stocktakes.id, users.name)
      .orderBy(desc(stocktakes.createdAt), desc(stocktakes.id));
  }
  createManualSession(data: {
    warehouse: Warehouse;
    note: string;
    createdBy: number;
  }) {
    return this.createSession({ ...data, categoryId: null, kind: "manual" });
  }
  async createManualLine(data: {
    stocktakeId: number;
    itemId: number;
    recordedQuantity: string;
    countedQuantity: string;
  }) {
    await this.db.insert(stocktakeLines).values(data);
  }
  receive(input: Record<string, unknown>) {
    return this.inventory.receive(
      input as Parameters<InventoryTransaction["receive"]>[0],
    );
  }
  consume(input: Record<string, unknown>) {
    return this.inventory.consume(
      input as Parameters<InventoryTransaction["consume"]>[0],
    );
  }
}
