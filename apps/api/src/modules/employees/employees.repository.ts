import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { employees, shifts, users } from "../../db/schema.js";
import type {
  EmployeeInput,
  EmployeeUpdateInput,
} from "./employees.schemas.js";

export class EmployeesRepository {
  constructor(private db: Db) {}

  transaction<T>(fn: (repo: EmployeesRepository) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) =>
      fn(new EmployeesRepository(tx as unknown as Db)),
    );
  }

  list() {
    return this.db
      .select({
        id: employees.id,
        name: employees.name,
        phone: employees.phone,
        jobTitle: employees.jobTitle,
        hireDate: employees.hireDate,
        payType: employees.payType,
        payRate: employees.payRate,
        notes: employees.notes,
        isActive: employees.isActive,
        createdAt: employees.createdAt,
        cashierUserId: users.id,
        cashierUsername: users.username,
        cashierIsActive: users.isActive,
      })
      .from(employees)
      .leftJoin(users, eq(users.employeeId, employees.id))
      .orderBy(employees.name);
  }

  async create(data: EmployeeInput) {
    const [result] = await this.db.insert(employees).values({
      ...data,
      payRate:
        data.payRate === null || data.payRate === undefined
          ? null
          : data.payRate.toFixed(2),
    });
    return result.insertId;
  }

  async update(id: number, data: EmployeeUpdateInput) {
    const { payRate, ...rest } = data;
    await this.db
      .update(employees)
      .set({
        ...rest,
        ...(payRate !== undefined
          ? { payRate: payRate === null ? null : payRate.toFixed(2) }
          : {}),
      })
      .where(eq(employees.id, id));
  }

  async syncCashierName(employeeId: number, name: string) {
    await this.db
      .update(users)
      .set({ name })
      .where(eq(users.employeeId, employeeId));
  }

  async findByIdForUpdate(id: number) {
    const [row] = await this.db
      .select()
      .from(employees)
      .where(eq(employees.id, id))
      .for("update");
    return row;
  }

  async findCashierAccessForUpdate(employeeId: number) {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.employeeId, employeeId))
      .for("update");
    return row;
  }

  async createCashierAccess(input: {
    employeeId: number;
    name: string;
    username: string;
    passwordHash: string;
  }) {
    const [result] = await this.db.insert(users).values({
      ...input,
      role: "cashier",
    });
    return result.insertId;
  }

  async revokeCashierAccess(userId: number) {
    await this.db
      .update(users)
      .set({
        isActive: false,
        tokenVersion: sql`${users.tokenVersion} + 1`,
      })
      .where(eq(users.id, userId));
  }

  async hasOpenShift(employeeId: number) {
    const [row] = await this.db
      .select({ id: shifts.id })
      .from(shifts)
      .where(and(eq(shifts.employeeId, employeeId), eq(shifts.openSlot, 1)))
      .limit(1);
    return row?.id !== undefined;
  }

  async restoreCashierAccess(input: {
    userId: number;
    username: string;
    passwordHash: string;
  }) {
    await this.db
      .update(users)
      .set({
        username: input.username,
        passwordHash: input.passwordHash,
        isActive: true,
        tokenVersion: sql`${users.tokenVersion} + 1`,
      })
      .where(eq(users.id, input.userId));
  }

  async deactivate(employeeId: number) {
    await this.db
      .update(employees)
      .set({ isActive: false })
      .where(eq(employees.id, employeeId));
  }
}
