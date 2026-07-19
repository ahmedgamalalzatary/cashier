import { and, eq, inArray, or, sql } from 'drizzle-orm';
import type { Db } from '../../db/index.js';
import { categories, items, recipes } from '../../db/schema.js';

export class CategoriesRepository {
  constructor(private db: Db) {}

  // runs fn with a repository bound to a transaction, so hierarchy checks
  // and their mutation see one consistent state
  transaction<T>(fn: (repo: CategoriesRepository) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) =>
      fn(new CategoriesRepository(tx as unknown as Db)),
    );
  }

  list() {
    return this.db.select().from(categories).orderBy(categories.name);
  }

  async findById(id: number) {
    const [row] = await this.db
      .select()
      .from(categories)
      .where(eq(categories.id, id));
    return row;
  }

  async findByIdForUpdate(id: number) {
    const [row] = await this.db
      .select()
      .from(categories)
      .where(eq(categories.id, id))
      .for('update');
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
      .for('update');
  }

  children(parentId: number) {
    return this.db
      .select()
      .from(categories)
      .where(eq(categories.parentId, parentId));
  }

  async hasActiveItems(categoryIds: number[]) {
    const [row] = await this.db
      .select({ id: items.id })
      .from(items)
      .where(
        and(inArray(items.categoryId, categoryIds), eq(items.isActive, true)),
      )
      .limit(1);
    return Boolean(row);
  }

  async hasActiveRecipes(categoryIds: number[]) {
    const [row] = await this.db
      .select({ id: recipes.id })
      .from(recipes)
      .where(
        and(
          inArray(recipes.categoryId, categoryIds),
          eq(recipes.isActive, true),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async create(data: { name: string; parentId?: number | null }) {
    const [result] = await this.db.insert(categories).values(data);
    return result.insertId;
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
