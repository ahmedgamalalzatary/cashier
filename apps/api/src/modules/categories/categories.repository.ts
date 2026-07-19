import { eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/index.js';
import { categories } from '../../db/schema.js';

export class CategoriesRepository {
  constructor(private db: Db) {}

  // runs fn with a repository bound to a transaction, so hierarchy checks
  // and their mutation see one consistent state
  transaction<T>(fn: (repo: CategoriesRepository) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => fn(new CategoriesRepository(tx as unknown as Db)));
  }

  list() {
    return this.db.select().from(categories).orderBy(categories.name);
  }

  async findById(id: number) {
    const [row] = await this.db.select().from(categories).where(eq(categories.id, id));
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

  children(parentId: number) {
    return this.db.select().from(categories).where(eq(categories.parentId, parentId));
  }

  childrenForUpdate(parentId: number) {
    return this.db
      .select()
      .from(categories)
      .where(eq(categories.parentId, parentId))
      .for('update');
  }

  async create(data: { name: string; parentId?: number | null }) {
    const [result] = await this.db.insert(categories).values(data);
    return result.insertId;
  }

  async update(id: number, data: { name?: string; parentId?: number | null }) {
    const [result] = await this.db.update(categories).set(data).where(eq(categories.id, id));
    return result.affectedRows > 0;
  }

  async deactivateMany(ids: number[]) {
    await this.db.update(categories).set({ isActive: false }).where(inArray(categories.id, ids));
  }
}
