import { desc, eq, sql } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import {
  employees,
  expenses,
  orders,
  refunds,
  shiftEvents,
  shifts,
  transferRequests,
  users,
  wasteEntries,
} from "../../db/schema.js";

const shiftColumns = {
  id: shifts.id,
  status: shifts.status,
  cashierUserId: shifts.cashierUserId,
  employeeId: shifts.employeeId,
  cashierName: employees.name,
  openingFloat: shifts.openingFloat,
  openedAt: shifts.openedAt,
  closedAt: shifts.closedAt,
  closedByUserId: shifts.closedByUserId,
  actualCash: shifts.actualCash,
  expectedCash: shifts.expectedCash,
  overShort: shifts.overShort,
};

export class ShiftsRepository {
  constructor(private db: Db) {}

  transaction<T>(fn: (repo: ShiftsRepository) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) =>
      fn(new ShiftsRepository(tx as unknown as Db)),
    );
  }

  async findCashierForUpdate(userId: number) {
    const [link] = await this.db
      .select({
        userId: users.id,
        userIsActive: users.isActive,
        employeeId: users.employeeId,
      })
      .from(users)
      .where(eq(users.id, userId));
    if (!link?.employeeId) return undefined;
    const [employee] = await this.db
      .select({ id: employees.id, isActive: employees.isActive })
      .from(employees)
      .where(eq(employees.id, link.employeeId))
      .for("update");
    const [user] = await this.db
      .select({
        userId: users.id,
        userIsActive: users.isActive,
        employeeId: users.employeeId,
      })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    if (!user || user.employeeId !== employee?.id) return undefined;
    return { ...user, employeeIsActive: employee.isActive };
  }

  async create(input: {
    cashierUserId: number;
    employeeId: number;
    openingFloat: string;
    openedAt: Date;
  }) {
    const [result] = await this.db.insert(shifts).values({
      ...input,
      status: "open",
      openSlot: 1,
    });
    return result.insertId;
  }

  async findById(id: number) {
    const [row] = await this.db
      .select(shiftColumns)
      .from(shifts)
      .innerJoin(employees, eq(shifts.employeeId, employees.id))
      .where(eq(shifts.id, id));
    return row;
  }

  async findByIdForUpdate(id: number) {
    const [row] = await this.db
      .select()
      .from(shifts)
      .where(eq(shifts.id, id))
      .for("update");
    return row;
  }

  async close(input: {
    id: number;
    closedByUserId: number;
    closedAt: Date;
    actualCash: string;
    expectedCash: string;
    overShort: string;
  }) {
    await this.db
      .update(shifts)
      .set({
        status: "closed",
        openSlot: null,
        closedByUserId: input.closedByUserId,
        closedAt: input.closedAt,
        actualCash: input.actualCash,
        expectedCash: input.expectedCash,
        overShort: input.overShort,
      })
      .where(eq(shifts.id, input.id));
  }

  async reopen(id: number) {
    await this.db
      .update(shifts)
      .set({
        status: "open",
        openSlot: 1,
        closedAt: null,
        closedByUserId: null,
        actualCash: null,
        expectedCash: null,
        overShort: null,
      })
      .where(eq(shifts.id, id));
  }

  async findCurrent() {
    const [row] = await this.db
      .select({ id: shifts.id, cashierUserId: shifts.cashierUserId })
      .from(shifts)
      .where(eq(shifts.openSlot, 1));
    return row;
  }

  listIds(cashierUserId?: number) {
    const query = this.db.select({ id: shifts.id }).from(shifts);
    return (
      cashierUserId === undefined
        ? query
        : query.where(eq(shifts.cashierUserId, cashierUserId))
    )
      .orderBy(desc(shifts.openedAt), desc(shifts.id))
      .limit(100);
  }

  async totals(id: number) {
    const [[orderTotals], [requestTotals], [refundTotals], [wasteTotals], [expenseTotals]] =
      await Promise.all([
        this.db
          .select({
            ordersCount: sql<number>`CAST(COUNT(${orders.id}) AS UNSIGNED)`,
            sales: sql<string>`CAST(COALESCE(SUM(${orders.total}), 0) AS DECIMAL(12,2))`,
            discounts: sql<string>`CAST(COALESCE(SUM(${orders.discountAmount}), 0) AS DECIMAL(12,2))`,
          })
          .from(orders)
          .where(eq(orders.shiftId, id)),
        this.db
          .select({
            transferRequests: sql<number>`CAST(COUNT(${transferRequests.id}) AS UNSIGNED)`,
          })
          .from(transferRequests)
          .where(eq(transferRequests.shiftId, id)),
        this.db
          .select({
            refunds: sql<string>`CAST(COALESCE(SUM(${refunds.amount}), 0) AS DECIMAL(12,2))`,
          })
          .from(refunds)
          .where(eq(refunds.shiftId, id)),
        this.db
          .select({
            wasteEntries: sql<number>`CAST(COUNT(${wasteEntries.id}) AS UNSIGNED)`,
          })
          .from(wasteEntries)
          .where(eq(wasteEntries.shiftId, id)),
        this.db
          .select({
            expenses: sql<string>`CAST(COALESCE(SUM(${expenses.amount}), 0) AS DECIMAL(12,2))`,
          })
          .from(expenses)
          .where(eq(expenses.shiftId, id)),
      ]);
    return {
      ...orderTotals,
      ...requestTotals,
      ...refundTotals,
      ...wasteTotals,
      ...expenseTotals,
    };
  }

  events(shiftId: number) {
    return this.db
      .select({
        id: shiftEvents.id,
        action: shiftEvents.action,
        actorUserId: shiftEvents.actorUserId,
        note: shiftEvents.note,
        openingFloat: shiftEvents.openingFloat,
        actualCash: shiftEvents.actualCash,
        expectedCash: shiftEvents.expectedCash,
        overShort: shiftEvents.overShort,
        occurredAt: shiftEvents.occurredAt,
      })
      .from(shiftEvents)
      .where(eq(shiftEvents.shiftId, shiftId))
      .orderBy(shiftEvents.occurredAt, shiftEvents.id);
  }

  async createEvent(data: typeof shiftEvents.$inferInsert) {
    await this.db.insert(shiftEvents).values(data);
  }

  async correct(input: {
    id: number;
    openingFloat: string;
    actualCash: string;
    expectedCash: string;
    overShort: string;
  }) {
    await this.db
      .update(shifts)
      .set({
        openingFloat: input.openingFloat,
        actualCash: input.actualCash,
        expectedCash: input.expectedCash,
        overShort: input.overShort,
      })
      .where(eq(shifts.id, input.id));
  }
}
