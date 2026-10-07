import {
  branchCondition,
  branchValues,
  branchTransaction,
} from "@cashier/db";
import { and, asc, desc, eq } from "drizzle-orm";
import type { Db } from "@cashier/db";
import { expenseCategories, expenses, shifts, users } from "@cashier/db";

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
    return branchTransaction(this.db, (tx) =>
      fn(new ExpensesRepository(tx as unknown as Db)),
    );
  }

  categories(includeInactive: boolean) {
    const query = this.db
      .select()
      .from(expenseCategories)
      .$dynamic()
      .where(branchCondition(expenseCategories));
    return (
      includeInactive
        ? query
        : query.where(
            branchCondition(
              expenseCategories,
              eq(expenseCategories.isActive, true),
            ),
          )
    ).orderBy(asc(expenseCategories.name));
  }

  async category(id: string, lock = false) {
    let query = this.db
      .select()
      .from(expenseCategories)
      .where(branchCondition(expenseCategories, eq(expenseCategories.id, id)));
    if (lock) query = query.for("update") as typeof query;
    const [row] = await query;
    return row;
  }

  async createCategory(name: string) {
    const [result] = await this.db
      .insert(expenseCategories)
      .values(branchValues({ name })).$returningId();
    return this.category(result.id);
  }

  async updateCategory(
    id: string,
    input: { name?: string; isActive?: boolean },
  ) {
    await this.db
      .update(expenseCategories)
      .set(input)
      .where(branchCondition(expenseCategories, eq(expenseCategories.id, id)));
    return this.category(id);
  }

  async openShiftForCashier(userId: string) {
    const [row] = await this.db
      .select({ id: shifts.id })
      .from(shifts)
      .where(
        branchCondition(
          shifts,
          and(eq(shifts.openSlot, 1), eq(shifts.cashierUserId, userId)),
        ),
      )
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
      .where(
        branchCondition(
          expenses,
          eq(expenses.clientRequestId, clientRequestId),
        ),
      );
    return row;
  }

  async create(data: Omit<typeof expenses.$inferInsert, "branchId">) {
    const [result] = await this.db.insert(expenses).values(branchValues(data)).$returningId();
    return result.id;
  }

  async get(id: string) {
    const [row] = await this.db
      .select(expenseColumns)
      .from(expenses)
      .innerJoin(
        expenseCategories,
        branchCondition(
          expenseCategories,
          eq(expenses.categoryId, expenseCategories.id),
        ),
      )
      .innerJoin(users, eq(expenses.recordedBy, users.id))
      .where(branchCondition(expenses, eq(expenses.id, id)));
    return row;
  }

  list(recordedBy?: string) {
    const query = this.db
      .select(expenseColumns)
      .from(expenses)
      .innerJoin(
        expenseCategories,
        branchCondition(
          expenseCategories,
          eq(expenses.categoryId, expenseCategories.id),
        ),
      )
      .innerJoin(users, eq(expenses.recordedBy, users.id))
      .$dynamic()
      .where(branchCondition(expenses));
    return (
      recordedBy === undefined
        ? query
        : query.where(
            branchCondition(expenses, eq(expenses.recordedBy, recordedBy)),
          )
    )
      .orderBy(desc(expenses.expenseDate), desc(expenses.id))
      .limit(200);
  }
}
