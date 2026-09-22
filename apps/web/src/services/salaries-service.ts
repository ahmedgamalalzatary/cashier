import type { SalaryMonth, SalaryPayment } from "@cashier/shared";
import { api } from "../lib/api";
export const getSalaryMonth = (month: string) =>
  api<SalaryMonth>(`/api/salaries?month=${encodeURIComponent(month)}`);
export const createSalaryAdvance = (body: {
  employeeId: number;
  amount: number;
  entryDate: string;
  note: string | null;
}) =>
  api<{ id: number }>("/api/salaries/advances", {
    method: "POST",
    body: JSON.stringify(body),
  });
export const createSalaryAdjustment = (body: {
  employeeId: number;
  type: "bonus" | "deduction";
  amount: number;
  entryDate: string;
  note: string | null;
}) =>
  api<{ id: number }>("/api/salaries/adjustments", {
    method: "POST",
    body: JSON.stringify(body),
  });
export const paySalary = (employeeId: number, month: string) =>
  api<SalaryPayment>("/api/salaries/payments", {
    method: "POST",
    body: JSON.stringify({ employeeId, month }),
  });
