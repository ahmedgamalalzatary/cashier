import { and, asc, desc, eq } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import {
  expenseCategories,
  expenses,
  shifts,
  users,
} from "../../db/schema.js";

const expenseColumns = {
  id: expenses.id,
  type: expenses.type,
  categoryId: expenses.categoryId,
  categoryName: expenseCategories.name,
  shiftId: expenses.shiftId,
  amount: expenses.amount,
  expenseDate: expenses.expenseDate,
  note: expenses.note,
  recordedBy: expenses.recordedBy,
  recordedByName: users.name,
  createdAt: expenses.createdAt,
};

export class ExpensesRepository {
  constructor(private db: Db) {}

  transaction<T>(fn: (repo: ExpensesRepository) => Promise<T>) {
    return this.db.transaction((tx) =>
      fn(new ExpensesRepository(tx as unknown as Db)),
    );
  }

  categories(includeInactive: boolean) {
    const query = this.db.select().from(expenseCategories);
    return (includeInactive
      ? query
      : query.where(eq(expenseCategories.isActive, true))
    ).orderBy(asc(expenseCategories.name));
  }

  async category(id: number, lock = false) {
    let query = this.db
      .select()
      .from(expenseCategories)
      .where(eq(expenseCategories.id, id));
    if (lock) query = query.for("update") as typeof query;
    const [row] = await query;
    return row;
  }

  async createCategory(name: string) {
    const [result] = await this.db.insert(expenseCategories).values({ name });
    return this.category(result.insertId);
  }

  async updateCategory(
    id: number,
    input: { name?: string; isActive?: boolean },
  ) {
    await this.db
      .update(expenseCategories)
      .set(input)
      .where(eq(expenseCategories.id, id));
    return this.category(id);
  }

  async openShiftForCashier(userId: number) {
    const [row] = await this.db
      .select({ id: shifts.id })
      .from(shifts)
      .where(and(eq(shifts.openSlot, 1), eq(shifts.cashierUserId, userId)))
      .for("update");
    return row;
  }

  async byRequestId(clientRequestId: string) {
    const [row] = await this.db
      .select({
        id: expenses.id,
        recordedBy: expenses.recordedBy,
        requestFingerprint: expenses.requestFingerprint,
      })
      .from(expenses)
      .where(eq(expenses.clientRequestId, clientRequestId));
    return row;
  }

  async create(data: typeof expenses.$inferInsert) {
    const [result] = await this.db.insert(expenses).values(data);
    return result.insertId;
  }

  async get(id: number) {
    const [row] = await this.db
      .select(expenseColumns)
      .from(expenses)
      .innerJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
      .innerJoin(users, eq(expenses.recordedBy, users.id))
      .where(eq(expenses.id, id));
    return row;
  }

  list(recordedBy?: number) {
    const query = this.db
      .select(expenseColumns)
      .from(expenses)
      .innerJoin(expenseCategories, eq(expenses.categoryId, expenseCategories.id))
      .innerJoin(users, eq(expenses.recordedBy, users.id));
    return (recordedBy === undefined
      ? query
      : query.where(eq(expenses.recordedBy, recordedBy))
    )
      .orderBy(desc(expenses.expenseDate), desc(expenses.id))
      .limit(200);
  }
}
