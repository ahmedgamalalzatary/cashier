import { HttpError } from "../../middleware/error.js";
import type { SalariesRepository } from "./salaries.repository.js";
import type { AdjustmentInput, AdvanceInput } from "./salaries.schemas.js";

function range(month: string) {
  const start = `${month}-01`;
  const d = new Date(`${start}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return { start, end: d.toISOString().slice(0, 10) };
}
const sum = (rows: Array<{ amount: string }>) =>
  rows.reduce((total, row) => total + Number(row.amount), 0);
const money = (value: number) => value.toFixed(2);

export class SalariesService {
  constructor(private repo: SalariesRepository) {}
  private async calculation(
    employeeId: number,
    month: string,
    locked = false,
    repo = this.repo,
  ) {
    const { start, end } = range(month);
    const employee = locked
      ? await repo.employeeForUpdate(employeeId)
      : await repo.employee(employeeId);
    if (!employee) throw new HttpError(404, "الموظف غير موجود");
    if (employee.payType !== "monthly" || employee.payRate === null)
      throw new HttpError(409, "يجب تحديد راتب شهري للموظف أولاً");
    const entries = await repo.monthEntries(employeeId, start, end);
    const bonuses = sum(
      entries.adjustments.filter((row) => row.type === "bonus"),
    );
    const deductions = sum(
      entries.adjustments.filter((row) => row.type === "deduction"),
    );
    const advances = sum(entries.advances) - Number(entries.settledAdvances);
    if (advances < 0)
      throw new HttpError(409, "بيانات السلف السابقة غير متسقة مع الدفعات");
    const basePay = Number(employee.payRate);
    const netPay = basePay + bonuses - deductions - advances;
    if (netPay < 0)
      throw new HttpError(409, "صافي الراتب سالب؛ راجع الخصومات والسلف");
    return {
      employeeId,
      employeeName: employee.name,
      month,
      basePay: money(basePay),
      bonuses: money(bonuses),
      deductions: money(deductions),
      advances: money(advances),
      netPay: money(netPay),
    };
  }
  preview(employeeId: number, month: string) {
    return this.calculation(employeeId, month);
  }
  async month(month: string) {
    const { start, end } = range(month);
    const [employees, advances, adjustments, payments] = await Promise.all([
      this.repo.listEmployees(),
      this.repo.listAdvances(start, end),
      this.repo.listAdjustments(start, end),
      this.repo.listPayments(start, end),
    ]);
    const paid = new Map(payments.map((p) => [p.employeeId, p]));
    return {
      month,
      employees: await Promise.all(
        employees.map(async (employee) => {
          const payment = paid.get(employee.id) ?? null;
          if (payment)
            return {
              employeeId: employee.id,
              employeeName: employee.name,
              isActive: employee.isActive,
              payType: employee.payType,
              payRate: employee.payRate,
              basePay: payment.basePay,
              bonuses: payment.bonuses,
              deductions: payment.deductions,
              advances: payment.advances,
              netPay: payment.netPay,
              payment,
            };
          if (employee.payType !== "monthly" || employee.payRate === null)
            return {
              employeeId: employee.id,
              employeeName: employee.name,
              isActive: employee.isActive,
              payType: employee.payType,
              payRate: employee.payRate,
              basePay: null,
              bonuses: "0.00",
              deductions: "0.00",
              advances: "0.00",
              netPay: null,
              payment: null,
            };
          let c;
          try {
            c = await this.calculation(employee.id, month);
          } catch (error) {
            if (!(error instanceof HttpError) || error.status !== 409)
              throw error;
            return {
              employeeId: employee.id,
              employeeName: employee.name,
              isActive: employee.isActive,
              payType: employee.payType,
              payRate: employee.payRate,
              basePay: null,
              bonuses: "0.00",
              deductions: "0.00",
              advances: "0.00",
              netPay: null,
              payment: null,
            };
          }
          return {
            ...c,
            isActive: employee.isActive,
            payType: employee.payType,
            payRate: employee.payRate,
            payment: null,
          };
        }),
      ),
      advances,
      adjustments,
      payments,
    };
  }
  private async validateEntry(
    employeeId: number,
    entryDate: string,
    repo = this.repo,
  ) {
    if (!(await repo.employeeForUpdate(employeeId)))
      throw new HttpError(404, "الموظف غير موجود");
    const latest = await repo.latestPaymentForEmployee(employeeId);
    if (latest && entryDate.slice(0, 7) <= latest.periodMonth.slice(0, 7))
      throw new HttpError(409, "لا يمكن إضافة حركة في شهر تم صرف راتبه");
  }
  async advance(input: AdvanceInput, actor: number) {
    return this.repo.transaction(async (repo) => {
      await this.validateEntry(input.employeeId, input.entryDate, repo);
      return repo.createAdvance({ ...input, recordedBy: actor });
    });
  }
  async adjustment(input: AdjustmentInput, actor: number) {
    return this.repo.transaction(async (repo) => {
      await this.validateEntry(input.employeeId, input.entryDate, repo);
      return repo.createAdjustment({ ...input, recordedBy: actor });
    });
  }
  pay(employeeId: number, month: string, actor: number) {
    return this.repo.transaction(async (repo) => {
      const periodMonth = `${month}-01`;
      const c = await this.calculation(employeeId, month, true, repo);
      if (await repo.paymentForMonth(employeeId, periodMonth))
        throw new HttpError(409, "تم صرف راتب هذا الشهر بالفعل");
      const id = await repo.createPayment({
        employeeId,
        periodMonth,
        basePay: c.basePay,
        bonuses: c.bonuses,
        deductions: c.deductions,
        advances: c.advances,
        netPay: c.netPay,
        paidBy: actor,
      });
      return await repo.payment(id);
    });
  }
}
