import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { categories, items, stockMovements } from "../../db/schema.js";
import type { ItemInput, ItemUpdateInput } from "./items.schemas.js";

const itemColumns = {
  id: items.id,
  name: items.name,
  categoryId: items.categoryId,
  categoryName: categories.name,
  type: items.type,
  stockUnit: items.stockUnit,
  purchaseUnit: items.purchaseUnit,
  purchaseToStockFactor: items.purchaseToStockFactor,
  mainMinimumLevel: items.mainMinimumLevel,
  cafeMinimumLevel: items.cafeMinimumLevel,
  hasStockHistory: sql<number>`EXISTS (
    SELECT 1 FROM stock_movements stock_history
    WHERE stock_history.item_id = ${items.id}
  )`,
  isActive: items.isActive,
  createdAt: items.createdAt,
};

function toDatabaseValues(data: ItemUpdateInput) {
  const { purchaseToStockFactor, mainMinimumLevel, cafeMinimumLevel, ...rest } =
    data;
  return {
    ...rest,
    ...(purchaseToStockFactor !== undefined
      ? {
          purchaseToStockFactor:
            purchaseToStockFactor === null
              ? null
              : purchaseToStockFactor.toFixed(6),
        }
      : {}),
    ...(mainMinimumLevel !== undefined
      ? { mainMinimumLevel: mainMinimumLevel.toFixed(3) }
      : {}),
    ...(cafeMinimumLevel !== undefined
      ? { cafeMinimumLevel: cafeMinimumLevel.toFixed(3) }
      : {}),
  };
}

export class ItemsRepository {
  constructor(private db: Db) {}

  transaction<T>(fn: (repo: ItemsRepository) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) =>
      fn(new ItemsRepository(tx as unknown as Db)),
    );
  }

  async list() {
    const rows = await this.db
      .select(itemColumns)
      .from(items)
      .innerJoin(categories, eq(items.categoryId, categories.id))
      .orderBy(items.name);
    return rows.map((row) => ({
      ...row,
      hasStockHistory: Boolean(row.hasStockHistory),
    }));
  }

  async findById(id: number) {
    const [row] = await this.db.select().from(items).where(eq(items.id, id));
    return row;
  }

  async findByIdForUpdate(id: number) {
    const [row] = await this.db
      .select()
      .from(items)
      .where(eq(items.id, id))
      .for("update");
    return row;
  }

  lockCategories(ids: number[]) {
    return this.db
      .select()
      .from(categories)
      .where(
        inArray(
          categories.id,
          [...new Set(ids)].sort((a, b) => a - b),
        ),
      )
      .orderBy(categories.id)
      .for("update");
  }

  async categoryHasChildren(categoryId: number) {
    const [row] = await this.db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.parentId, categoryId))
      .limit(1);
    return Boolean(row);
  }

  async hasStockHistory(itemId: number) {
    const [row] = await this.db
      .select({ id: stockMovements.id })
      .from(stockMovements)
      .where(eq(stockMovements.itemId, itemId))
      .limit(1);
    return Boolean(row);
  }

  async create(data: ItemInput) {
    const [result] = await this.db.insert(items).values({
      name: data.name,
      categoryId: data.categoryId,
      type: data.type,
      stockUnit: data.stockUnit,
      purchaseUnit: data.purchaseUnit,
      purchaseToStockFactor:
        data.purchaseToStockFactor === null ||
        data.purchaseToStockFactor === undefined
          ? null
          : data.purchaseToStockFactor.toFixed(6),
      mainMinimumLevel: data.mainMinimumLevel.toFixed(3),
      cafeMinimumLevel: data.cafeMinimumLevel.toFixed(3),
    });
    return result.insertId;
  }

  async update(id: number, data: ItemUpdateInput) {
    const [result] = await this.db
      .update(items)
      .set(toDatabaseValues(data))
      .where(eq(items.id, id));
    return result.affectedRows > 0;
  }

  async deactivate(id: number) {
    const [result] = await this.db
      .update(items)
      .set({ isActive: false })
      .where(and(eq(items.id, id), eq(items.isActive, true)));
    return result.affectedRows > 0;
  }
}
