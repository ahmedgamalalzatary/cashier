import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import {
  categories,
  categoryColors,
  categorySizes,
  products,
} from "../../db/schema.js";

export class CategoriesRepository {
  constructor(private db: Db) {}

  transaction<T>(fn: (repo: CategoriesRepository) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) =>
      fn(new CategoriesRepository(tx as unknown as Db)),
    );
  }

  async list() {
    const [categoryRows, colors, sizes] = await Promise.all([
      this.db.select().from(categories).orderBy(categories.name),
      this.db.select().from(categoryColors).orderBy(categoryColors.name),
      this.db.select().from(categorySizes).orderBy(categorySizes.name),
    ]);
    return categoryRows.map((category) => ({
      ...category,
      colors: colors.filter((option) => option.categoryId === category.id),
      sizes: sizes.filter((option) => option.categoryId === category.id),
    }));
  }

  async findByIdForUpdate(id: number) {
    const [row] = await this.db
      .select()
      .from(categories)
      .where(eq(categories.id, id))
      .for("update");
    return row;
  }

  lockForUpdate(id: number, requestedParentId?: number) {
    const directIds =
      requestedParentId === undefined ? [id] : [id, requestedParentId];
    return this.db
      .select()
      .from(categories)
      .where(
        or(
          inArray(categories.id, directIds),
          eq(categories.parentId, id),
          sql`${categories.id} = (
            SELECT current_category.parent_id
            FROM categories current_category
            WHERE current_category.id = ${id}
          )`,
        ),
      )
      .orderBy(categories.id)
      .for("update");
  }

  async hasActiveItems(categoryIds: number[]) {
    const [row] = await this.db
      .select({ id: products.id })
      .from(products)
      .where(
        and(
          inArray(products.categoryId, categoryIds),
          eq(products.isActive, true),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async create(data: { name: string; parentId?: number | null }) {
    const [result] = await this.db.insert(categories).values(data);
    return result.insertId;
  }

  async replaceOptions(
    categoryId: number,
    colors?: string[],
    sizes?: string[],
  ) {
    if (colors) {
      await this.db
        .update(categoryColors)
        .set({ isActive: false })
        .where(eq(categoryColors.categoryId, categoryId));
      for (const name of colors) {
        await this.db
          .insert(categoryColors)
          .values({ categoryId, name, isActive: true })
          .onDuplicateKeyUpdate({ set: { isActive: true } });
      }
    }
    if (sizes) {
      await this.db
        .update(categorySizes)
        .set({ isActive: false })
        .where(eq(categorySizes.categoryId, categoryId));
      for (const name of sizes) {
        await this.db
          .insert(categorySizes)
          .values({ categoryId, name, isActive: true })
          .onDuplicateKeyUpdate({ set: { isActive: true } });
      }
    }
  }

  async update(
    id: number,
    data: { name?: string; parentId?: number | null; isActive?: boolean },
  ) {
    const [result] = await this.db
      .update(categories)
      .set(data)
      .where(eq(categories.id, id));
    return result.affectedRows > 0;
  }

  async deactivateMany(ids: number[]) {
    await this.db
      .update(categories)
      .set({ isActive: false })
      .where(inArray(categories.id, ids));
  }
}
