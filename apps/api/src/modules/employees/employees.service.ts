import bcrypt from "bcryptjs";
import { HttpError } from "../../middleware/error.js";
import type { EmployeesRepository } from "./employees.repository.js";
import type {
  CashierAccessInput,
  EmployeeInput,
  EmployeeUpdateInput,
} from "./employees.schemas.js";

function duplicateEntry(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ER_DUP_ENTRY"
  );
}

export class EmployeesService {
  constructor(private repo: EmployeesRepository) {}

  list() {
    return this.repo.list().then((rows) =>
      rows.map(
        ({ cashierUserId, cashierUsername, cashierIsActive, ...employee }) => ({
          ...employee,
          cashierAccess:
            cashierUserId === null
              ? null
              : {
                  userId: cashierUserId,
                  username: cashierUsername!,
                  isActive: cashierIsActive!,
                },
        }),
      ),
    );
  }

  create(data: EmployeeInput) {
    return this.repo.create(data);
  }

  update(employeeId: number, data: EmployeeUpdateInput) {
    return this.repo.transaction(async (repo) => {
      const employee = await repo.findByIdForUpdate(employeeId);
      if (!employee) throw new HttpError(404, "الموظف غير موجود");
      await repo.update(employeeId, data);
      if (data.name !== undefined && data.name !== employee.name) {
        await repo.syncCashierName(employeeId, data.name);
      }
    });
  }

  async grantCashierAccess(employeeId: number, data: CashierAccessInput) {
    try {
      return await this.repo.transaction(async (repo) => {
        const employee = await repo.findByIdForUpdate(employeeId);
        if (!employee) throw new HttpError(404, "الموظف غير موجود");
        if (!employee.isActive) throw new HttpError(409, "الموظف موقوف");
        const existing = await repo.findCashierAccessForUpdate(employeeId);
        if (existing?.isActive)
          throw new HttpError(409, "الموظف لديه حساب كاشير بالفعل");
        const passwordHash = await bcrypt.hash(data.password, 10);
        if (existing) {
          await repo.restoreCashierAccess({
            userId: existing.id,
            username: data.username,
            passwordHash,
          });
          return { userId: existing.id, created: false };
        }
        const userId = await repo.createCashierAccess({
          employeeId,
          name: employee.name,
          username: data.username,
          passwordHash,
        });
        return { userId, created: true };
      });
    } catch (error) {
      if (duplicateEntry(error))
        throw new HttpError(409, "اسم المستخدم مستخدم بالفعل");
      throw error;
    }
  }

  revokeCashierAccess(employeeId: number) {
    return this.repo.transaction(async (repo) => {
      const employee = await repo.findByIdForUpdate(employeeId);
      if (!employee) throw new HttpError(404, "الموظف غير موجود");
      const user = await repo.findCashierAccessForUpdate(employeeId);
      if (!user) throw new HttpError(404, "لا يوجد حساب كاشير مرتبط بالموظف");
      if (!user.isActive) return;
      if (await repo.hasOpenShift(employeeId))
        throw new HttpError(
          409,
          "لا يمكن إيقاف حساب الكاشير أثناء وجود وردية مفتوحة",
        );
      await repo.revokeCashierAccess(user.id);
    });
  }

  deactivate(employeeId: number) {
    return this.repo.transaction(async (repo) => {
      const employee = await repo.findByIdForUpdate(employeeId);
      if (!employee) throw new HttpError(404, "الموظف غير موجود");
      if (!employee.isActive) return;
      if (await repo.hasOpenShift(employeeId))
        throw new HttpError(
          409,
          "لا يمكن إيقاف الموظف أثناء وجود وردية مفتوحة",
        );
      const user = await repo.findCashierAccessForUpdate(employeeId);
      if (user?.isActive) await repo.revokeCashierAccess(user.id);
      await repo.deactivate(employeeId);
    });
  }
}
