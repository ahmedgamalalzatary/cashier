import {
  branchCondition,
  branchValues,
  branchTransaction,
} from "@cashier/db";
import { and, desc, eq, gte, lt, lte, sql } from "drizzle-orm";
import type { Db } from "@cashier/db";
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
} from "@cashier/db";

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
    return branchTransaction(this.db, (tx) =>
      fn(new ShiftsRepository(tx as unknown as Db)),
    );
  }

  async findCashierForUpdate(userId: string) {
    const [link] = await this.db
      .select({
        userId: users.id,
        userIsActive: users.isActive,
        employeeId: users.employeeId,
      })
      .from(users)
      .where(branchCondition(users, eq(users.id, userId)));
    if (!link?.employeeId) return undefined;
    const [employee] = await this.db
      .select({ id: employees.id, isActive: employees.isActive })
      .from(employees)
      .where(branchCondition(employees, eq(employees.id, link.employeeId)))
      .for("update");
    const [user] = await this.db
      .select({
        userId: users.id,
        userIsActive: users.isActive,
        employeeId: users.employeeId,
      })
      .from(users)
      .where(branchCondition(users, eq(users.id, userId)))
      .for("update");
    if (!user || user.employeeId !== employee?.id) return undefined;
    return { ...user, employeeIsActive: employee.isActive };
  }

  async create(input: {
    cashierUserId: string;
    employeeId: string;
    openingFloat: string;
    openedAt: Date;
  }) {
    const [result] = await this.db.insert(shifts).values(
      branchValues({
        ...input,
        status: "open",
        openSlot: 1,
      }),
    ).$returningId();
    return result.id;
  }

  async findById(id: string) {
    const [row] = await this.db
      .select(shiftColumns)
      .from(shifts)
      .innerJoin(
        employees,
        branchCondition(employees, eq(shifts.employeeId, employees.id)),
      )
      .where(branchCondition(shifts, eq(shifts.id, id)));
    return row;
  }

  async findByIdForUpdate(id: string) {
    const [row] = await this.db
      .select()
      .from(shifts)
      .where(branchCondition(shifts, eq(shifts.id, id)))
      .for("update");
    return row;
  }

  async close(input: {
    id: string;
    // An auto-close has no human actor and no counted drawer: all three stay NULL.
    closedByUserId: string | null;
    closedAt: Date;
    actualCash: string | null;
    expectedCash: string;
    overShort: string | null;
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
      .where(branchCondition(shifts, eq(shifts.id, input.id)));
  }

  async reopen(id: string) {
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
      .where(branchCondition(shifts, eq(shifts.id, id)));
  }

  async findCurrent(cashierUserId: string) {
    const [row] = await this.db
      .select({ id: shifts.id, cashierUserId: shifts.cashierUserId })
      .from(shifts)
      .where(
        branchCondition(
          shifts,
          and(eq(shifts.openSlot, 1), eq(shifts.cashierUserId, cashierUserId)),
        ),
      );
    return row;
  }

  async findExpiredOpen(cutoff: Date) {
    return this.db
      .select({ id: shifts.id, openedAt: shifts.openedAt })
      .from(shifts)
      .where(
        branchCondition(
          shifts,
          and(eq(shifts.openSlot, 1), lte(shifts.openedAt, cutoff)),
        ),
      )
      .orderBy(shifts.openedAt, shifts.id)
      .for("update");
  }

  activeIds() {
    return this.db
      .select({ id: shifts.id })
      .from(shifts)
      .where(branchCondition(shifts, eq(shifts.openSlot, 1)))
      .orderBy(desc(shifts.openedAt), desc(shifts.id));
  }

  dayIds(start: Date, end: Date, cashierUserId?: string) {
    return this.db
      .select({ id: shifts.id })
      .from(shifts)
      .where(
        branchCondition(
          shifts,
          and(
            gte(shifts.openedAt, start),
            lt(shifts.openedAt, end),
            cashierUserId === undefined
              ? undefined
              : eq(shifts.cashierUserId, cashierUserId),
          ),
        ),
      )
      .orderBy(desc(shifts.openedAt), desc(shifts.id));
  }

  listIds(cashierUserId?: string, pagination = { limit: 100, offset: 0 }) {
    const query = this.db
      .select({ id: shifts.id })
      .from(shifts)
      .$dynamic()
      .where(branchCondition(shifts));
    return (
      cashierUserId === undefined
        ? query
        : query.where(
            branchCondition(shifts, eq(shifts.cashierUserId, cashierUserId)),
          )
    )
      .orderBy(desc(shifts.openedAt), desc(shifts.id))
      .limit(pagination.limit)
      .offset(pagination.offset);
  }

  async totals(id: string) {
    const [
      [orderTotals],
      [requestTotals],
      [refundTotals],
      [wasteTotals],
      [expenseTotals],
    ] = await Promise.all([
      this.db
        .select({
          ordersCount: sql<number>`CAST(COUNT(${orders.id}) AS UNSIGNED)`,
          sales: sql<string>`CAST(COALESCE(SUM(${orders.total}), 0) AS DECIMAL(12,2))`,
          discounts: sql<string>`CAST(COALESCE(SUM(${orders.discountAmount}), 0) AS DECIMAL(12,2))`,
        })
        .from(orders)
        .where(branchCondition(orders, eq(orders.shiftId, id))),
      this.db
        .select({
          transferRequests: sql<number>`CAST(COUNT(${transferRequests.id}) AS UNSIGNED)`,
        })
        .from(transferRequests)
        .where(
          branchCondition(transferRequests, eq(transferRequests.shiftId, id)),
        ),
      this.db
        .select({
          refunds: sql<string>`CAST(COALESCE(SUM(${refunds.amount}), 0) AS DECIMAL(12,2))`,
        })
        .from(refunds)
        .where(branchCondition(refunds, eq(refunds.shiftId, id))),
      this.db
        .select({
          wasteEntries: sql<number>`CAST(COUNT(${wasteEntries.id}) AS UNSIGNED)`,
        })
        .from(wasteEntries)
        .where(branchCondition(wasteEntries, eq(wasteEntries.shiftId, id))),
      this.db
        .select({
          expenses: sql<string>`CAST(COALESCE(SUM(${expenses.amount}), 0) AS DECIMAL(12,2))`,
        })
        .from(expenses)
        .where(branchCondition(expenses, eq(expenses.shiftId, id))),
    ]);
    return {
      ...orderTotals,
      ...requestTotals,
      ...refundTotals,
      ...wasteTotals,
      ...expenseTotals,
    };
  }

  events(shiftId: string) {
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
      .where(branchCondition(shiftEvents, eq(shiftEvents.shiftId, shiftId)))
      .orderBy(shiftEvents.occurredAt, shiftEvents.id);
  }

  async createEvent(data: Omit<typeof shiftEvents.$inferInsert, "branchId">) {
    await this.db.insert(shiftEvents).values(branchValues(data));
  }

  async correct(input: {
    id: string;
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
      .where(branchCondition(shifts, eq(shifts.id, input.id)));
  }
}
