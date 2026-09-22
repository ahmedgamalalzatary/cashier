import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import {
  employees,
  salaryAdjustments,
  salaryAdvances,
  salaryPayments,
  users,
} from "../../db/schema.js";
import type { AdjustmentInput, AdvanceInput } from "./salaries.schemas.js";

const advanceColumns = {
  id: salaryAdvances.id,
  employeeId: salaryAdvances.employeeId,
  employeeName: employees.name,
  amount: salaryAdvances.amount,
  entryDate: salaryAdvances.entryDate,
  note: salaryAdvances.note,
  recordedByName: users.name,
  createdAt: salaryAdvances.createdAt,
};
const adjustmentColumns = {
  id: salaryAdjustments.id,
  employeeId: salaryAdjustments.employeeId,
  employeeName: employees.name,
  type: salaryAdjustments.type,
  amount: salaryAdjustments.amount,
  entryDate: salaryAdjustments.entryDate,
  note: salaryAdjustments.note,
  recordedByName: users.name,
  createdAt: salaryAdjustments.createdAt,
};
const paymentColumns = {
  id: salaryPayments.id,
  employeeId: salaryPayments.employeeId,
  employeeName: employees.name,
  periodMonth: salaryPayments.periodMonth,
  basePay: salaryPayments.basePay,
  bonuses: salaryPayments.bonuses,
  deductions: salaryPayments.deductions,
  advances: salaryPayments.advances,
  netPay: salaryPayments.netPay,
  paidByName: users.name,
  paidAt: salaryPayments.paidAt,
};

export class SalariesRepository {
  constructor(private db: Db) {}
  transaction<T>(fn: (repo: SalariesRepository) => Promise<T>) {
    return this.db.transaction((tx) =>
      fn(new SalariesRepository(tx as unknown as Db)),
    );
  }
  listEmployees() {
    return this.db
      .select({
        id: employees.id,
        name: employees.name,
        isActive: employees.isActive,
        payType: employees.payType,
        payRate: employees.payRate,
      })
      .from(employees)
      .orderBy(asc(employees.name));
  }
  async employee(id: number) {
    const [row] = await this.db
      .select()
      .from(employees)
      .where(eq(employees.id, id));
    return row;
  }
  async employeeForUpdate(id: number) {
    const [row] = await this.db
      .select()
      .from(employees)
      .where(eq(employees.id, id))
      .for("update");
    return row;
  }
  listAdvances(start: string, end: string) {
    return this.db
      .select(advanceColumns)
      .from(salaryAdvances)
      .innerJoin(employees, eq(employees.id, salaryAdvances.employeeId))
      .innerJoin(users, eq(users.id, salaryAdvances.recordedBy))
      .where(
        and(
          gte(salaryAdvances.entryDate, start),
          lt(salaryAdvances.entryDate, end),
        ),
      )
      .orderBy(desc(salaryAdvances.entryDate), desc(salaryAdvances.id));
  }
  listAdjustments(start: string, end: string) {
    return this.db
      .select(adjustmentColumns)
      .from(salaryAdjustments)
      .innerJoin(employees, eq(employees.id, salaryAdjustments.employeeId))
      .innerJoin(users, eq(users.id, salaryAdjustments.recordedBy))
      .where(
        and(
          gte(salaryAdjustments.entryDate, start),
          lt(salaryAdjustments.entryDate, end),
        ),
      )
      .orderBy(desc(salaryAdjustments.entryDate), desc(salaryAdjustments.id));
  }
  listPayments(start: string, end: string) {
    return this.db
      .select(paymentColumns)
      .from(salaryPayments)
      .innerJoin(employees, eq(employees.id, salaryPayments.employeeId))
      .innerJoin(users, eq(users.id, salaryPayments.paidBy))
      .where(
        and(
          gte(salaryPayments.periodMonth, start),
          lt(salaryPayments.periodMonth, end),
        ),
      )
      .orderBy(desc(salaryPayments.paidAt));
  }
  async monthEntries(employeeId: number, start: string, end: string) {
    const [advances, adjustments, settled] = await Promise.all([
      this.db
        .select({ amount: salaryAdvances.amount })
        .from(salaryAdvances)
        .where(
          and(
            eq(salaryAdvances.employeeId, employeeId),
            lt(salaryAdvances.entryDate, end),
          ),
        ),
      this.db
        .select({
          type: salaryAdjustments.type,
          amount: salaryAdjustments.amount,
        })
        .from(salaryAdjustments)
        .where(
          and(
            eq(salaryAdjustments.employeeId, employeeId),
            gte(salaryAdjustments.entryDate, start),
            lt(salaryAdjustments.entryDate, end),
          ),
        ),
      this.db
        .select({
          amount: sql<string>`COALESCE(SUM(${salaryPayments.advances}), 0)`,
        })
        .from(salaryPayments)
        .where(
          and(
            eq(salaryPayments.employeeId, employeeId),
            lt(salaryPayments.periodMonth, start),
          ),
        ),
    ]);
    return {
      advances,
      adjustments,
      settledAdvances: settled[0]?.amount ?? "0.00",
    };
  }
  async paymentForMonth(employeeId: number, month: string) {
    const [row] = await this.db
      .select()
      .from(salaryPayments)
      .where(
        and(
          eq(salaryPayments.employeeId, employeeId),
          eq(salaryPayments.periodMonth, month),
        ),
      )
      .for("update");
    return row;
  }
  async latestPaymentForEmployee(employeeId: number) {
    const [row] = await this.db
      .select({ periodMonth: salaryPayments.periodMonth })
      .from(salaryPayments)
      .where(eq(salaryPayments.employeeId, employeeId))
      .orderBy(desc(salaryPayments.periodMonth))
      .limit(1);
    return row;
  }
  async createAdvance(input: AdvanceInput & { recordedBy: number }) {
    const [result] = await this.db
      .insert(salaryAdvances)
      .values({ ...input, amount: input.amount.toFixed(2) });
    return { id: result.insertId };
  }
  async createAdjustment(input: AdjustmentInput & { recordedBy: number }) {
    const [result] = await this.db
      .insert(salaryAdjustments)
      .values({ ...input, amount: input.amount.toFixed(2) });
    return { id: result.insertId };
  }
  async createPayment(input: typeof salaryPayments.$inferInsert) {
    const [result] = await this.db.insert(salaryPayments).values(input);
    return result.insertId;
  }
  async payment(id: number) {
    const [row] = await this.db
      .select(paymentColumns)
      .from(salaryPayments)
      .innerJoin(employees, eq(employees.id, salaryPayments.employeeId))
      .innerJoin(users, eq(users.id, salaryPayments.paidBy))
      .where(eq(salaryPayments.id, id));
    return row;
  }
}
