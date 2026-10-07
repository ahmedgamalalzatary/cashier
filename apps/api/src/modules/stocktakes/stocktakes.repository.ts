import {
  branchCondition,
  branchValues,
  branchTable,
  branchTransaction,
} from "@cashier/db";
import { and, asc, desc, eq, or, sql } from "drizzle-orm";
import type { Warehouse } from "@cashier/shared";
import type { Db } from "@cashier/db";
import {
  categories,
  items,
  stocktakeLines,
  stocktakes,
  users,
} from "@cashier/db";
import { InventoryRepository } from "../inventory/inventory.repository.js";
import { InventoryTransaction } from "../inventory/inventory.service.js";
import { HttpError } from "@cashier/server-core";

export type StocktakeSessionRecord = {
  id: string;
  warehouse: Warehouse;
  status: "draft" | "confirmed";
  createdBy: string;
};
export type StocktakeLineRecord = {
  id: string;
  itemId: string;
  recordedQuantity: string;
  countedQuantity: string | null;
};
export type StocktakeSnapshot = { itemId: string; recordedQuantity: string };

export interface StocktakesRepositoryPort {
  transaction<T>(
    fn: (repo: StocktakesRepositoryPort) => Promise<T>,
  ): Promise<T>;
  createSession(data: {
    warehouse: Warehouse;
    categoryId: string | null;
    note: string | null;
    createdBy: string;
    kind?: "stocktake" | "manual";
  }): Promise<string>;
  snapshotItems(
    warehouse: Warehouse,
    categoryId: string | null,
  ): Promise<StocktakeSnapshot[]>;
  createLines(stocktakeId: string, rows: StocktakeSnapshot[]): Promise<void>;
  findSessionForUpdate(id: string): Promise<StocktakeSessionRecord | undefined>;
  listLinesForUpdate(id: string): Promise<StocktakeLineRecord[]>;
  updateCounts(
    id: string,
    lines: Array<{ itemId: string; countedQuantity: number }>,
  ): Promise<void>;
  currentQuantity(itemId: string, warehouse: Warehouse): Promise<string>;
  currentFifoCost(itemId: string, warehouse: Warehouse): Promise<string>;
  markConfirmed(id: string, note: string): Promise<void>;
  detail(id: string): Promise<unknown>;
  list(): Promise<unknown[]>;
  createManualSession(data: {
    warehouse: Warehouse;
    note: string;
    createdBy: string;
  }): Promise<string>;
  createManualLine(data: {
    stocktakeId: string;
    itemId: string;
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
    return branchTransaction(this.db, (tx) =>
      fn(new StocktakesRepository(tx as unknown as Db)),
    );
  }
  async createSession(data: {
    warehouse: Warehouse;
    categoryId: string | null;
    note: string | null;
    createdBy: string;
    kind?: "stocktake" | "manual";
  }) {
    const [result] = await this.db
      .insert(stocktakes)
      .values(branchValues({ ...data, kind: data.kind ?? "stocktake" })).$returningId();
    return result.id;
  }
  snapshotItems(warehouse: Warehouse, categoryId: string | null) {
    const recordedQuantity = sql<string>`CAST(COALESCE((SELECT SUM(sm.quantity) FROM ${branchTable("stock_movements")} sm WHERE sm.item_id=${items.id} AND sm.warehouse=${warehouse}),0) AS DECIMAL(14,3))`;
    return this.db
      .select({ itemId: items.id, recordedQuantity })
      .from(items)
      .leftJoin(
        categories,
        branchCondition(categories, eq(categories.id, items.categoryId)),
      )
      .where(
        branchCondition(
          items,
          categoryId === null
            ? eq(items.isActive, true)
            : and(
                eq(items.isActive, true),
                or(
                  eq(items.categoryId, categoryId),
                  eq(categories.parentId, categoryId),
                ),
              ),
        ),
      )
      .orderBy(asc(items.id));
  }
  async createLines(stocktakeId: string, rows: StocktakeSnapshot[]) {
    if (rows.length)
      await this.db
        .insert(stocktakeLines)
        .values(branchValues(rows.map((row) => ({ stocktakeId, ...row }))));
  }
  async findSessionForUpdate(id: string) {
    const [row] = await this.db
      .select({
        id: stocktakes.id,
        warehouse: stocktakes.warehouse,
        status: stocktakes.status,
        createdBy: stocktakes.createdBy,
      })
      .from(stocktakes)
      .where(branchCondition(stocktakes, eq(stocktakes.id, id)))
      .for("update");
    return row;
  }
  listLinesForUpdate(id: string) {
    return this.db
      .select({
        id: stocktakeLines.id,
        itemId: stocktakeLines.itemId,
        recordedQuantity: stocktakeLines.recordedQuantity,
        countedQuantity: stocktakeLines.countedQuantity,
      })
      .from(stocktakeLines)
      .where(
        branchCondition(stocktakeLines, eq(stocktakeLines.stocktakeId, id)),
      )
      .orderBy(asc(stocktakeLines.itemId))
      .for("update");
  }
  async updateCounts(
    id: string,
    lines: Array<{ itemId: string; countedQuantity: number }>,
  ) {
    for (const line of lines) {
      const [result] = await this.db
        .update(stocktakeLines)
        .set({ countedQuantity: line.countedQuantity.toFixed(3) })
        .where(
          branchCondition(
            stocktakeLines,
            and(
              eq(stocktakeLines.stocktakeId, id),
              eq(stocktakeLines.itemId, line.itemId),
            ),
          ),
        );
      if (result.affectedRows !== 1)
        throw new Error("STOCKTAKE_LINE_NOT_FOUND");
    }
  }
  async currentQuantity(itemId: string, warehouse: Warehouse) {
    const item = await new InventoryRepository(this.db).findItemForUpdate(
      itemId,
    );
    if (!item) throw new HttpError(404, "الصنف غير موجود");
    if (!item.isActive) throw new HttpError(409, "الصنف موقوف");
    const [row] = await this.db.execute(
      sql`SELECT CAST(COALESCE(SUM(quantity),0) AS DECIMAL(14,3)) quantity FROM ${branchTable("stock_movements")} stock_movements WHERE item_id=${itemId} AND warehouse=${warehouse}`,
    );
    return String(
      (row as unknown as Array<{ quantity: string }>)[0]?.quantity ?? "0.000",
    );
  }
  async currentFifoCost(itemId: string, warehouse: Warehouse) {
    // Surplus found on an empty shelf has no batch with stock left, so fall back
    // to the newest batch of any remaining quantity. Valuing found stock at zero
    // would hide its cost from every later sale's COGS. Rows with stock still
    // come first and stay in FIFO order, so the stocked case is unchanged.
    const [row] = await this.db.execute(
      sql`SELECT unit_cost unitCost FROM ${branchTable("stock_batches")} stock_batches
        WHERE item_id=${itemId} AND warehouse=${warehouse}
        ORDER BY (remaining_quantity>0) DESC,
          CASE WHEN remaining_quantity>0 THEN received_at END ASC,
          CASE WHEN remaining_quantity>0 THEN id END ASC,
          received_at DESC, id DESC LIMIT 1`,
    );
    return String(
      (row as unknown as Array<{ unitCost: string }>)[0]?.unitCost ??
        "0.000000",
    );
  }
  async markConfirmed(id: string, note: string) {
    await this.db
      .update(stocktakes)
      .set({ status: "confirmed", note, confirmedAt: new Date() })
      .where(branchCondition(stocktakes, eq(stocktakes.id, id)));
  }
  async detail(id: string) {
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
      .where(branchCondition(stocktakes, eq(stocktakes.id, id)));
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
      .innerJoin(
        items,
        branchCondition(items, eq(items.id, stocktakeLines.itemId)),
      )
      .where(
        branchCondition(stocktakeLines, eq(stocktakeLines.stocktakeId, id)),
      )
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
      .leftJoin(
        stocktakeLines,
        branchCondition(
          stocktakeLines,
          eq(stocktakeLines.stocktakeId, stocktakes.id),
        ),
      )
      .where(branchCondition(stocktakes))
      .groupBy(stocktakes.id, users.name)
      .orderBy(desc(stocktakes.createdAt), desc(stocktakes.id));
  }
  createManualSession(data: {
    warehouse: Warehouse;
    note: string;
    createdBy: string;
  }) {
    return this.createSession({ ...data, categoryId: null, kind: "manual" });
  }
  async createManualLine(data: {
    stocktakeId: string;
    itemId: string;
    recordedQuantity: string;
    countedQuantity: string;
  }) {
    await this.db.insert(stocktakeLines).values(branchValues(data));
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
