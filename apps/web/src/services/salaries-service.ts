import type { SalaryMonth, SalaryPayment } from "@cashier/shared";
import { api } from "@cashier/web-core/lib/api";
export const getSalaryMonth = (month: string) =>
  api<SalaryMonth>(`/api/salaries?month=${encodeURIComponent(month)}`);
export const createSalaryAdvance = (body: {
  employeeId: string;
  amount: number;
  entryDate: string;
  note: string | null;
}) =>
  api<{ id: string }>("/api/salaries/advances", {
    method: "POST",
    body: JSON.stringify(body),
  });
export const createSalaryAdjustment = (body: {
  employeeId: string;
  type: "bonus" | "deduction";
  amount: number;
  entryDate: string;
  note: string | null;
}) =>
  api<{ id: string }>("/api/salaries/adjustments", {
    method: "POST",
    body: JSON.stringify(body),
  });
export const paySalary = (employeeId: string, month: string) =>
  api<SalaryPayment>("/api/salaries/payments", {
    method: "POST",
    body: JSON.stringify({ employeeId, month }),
  });
