import type { Employee } from "@cashier/shared";
import { api } from "@cashier/web-core/lib/api";

export type EmployeeSaveBody = {
  name?: string;
  phone?: string | null;
  jobTitle?: string | null;
  hireDate?: string | null;
  payRate?: number | null;
  notes?: string | null;
  isActive?: true;
};

export type CashierAccessBody = {
  username: string;
  password: string;
};

/** payroll is monthly only: an empty field means the salary was never set */
export function employeeSalaryPayload(
  payRate: string,
): Pick<EmployeeSaveBody, "payRate"> {
  return { payRate: payRate === "" ? null : Number(payRate) };
}

export const listEmployees = () => api<Employee[]>("/api/employees");

export const createEmployee = (body: EmployeeSaveBody) =>
  api<{ id: string }>("/api/employees", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const updateEmployee = (id: string, body: EmployeeSaveBody) =>
  api<{ ok: true }>(`/api/employees/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });

export const deactivateEmployee = (id: string) =>
  api<void>(`/api/employees/${id}`, { method: "DELETE" });

export const grantCashierAccess = (id: string, body: CashierAccessBody) =>
  api<{ userId: string }>(`/api/employees/${id}/cashier-access`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const revokeCashierAccess = (id: string) =>
  api<void>(`/api/employees/${id}/cashier-access`, { method: "DELETE" });

export const resetCashierPassword = (id: string, password: string) =>
  api<{ ok: true }>(`/api/employees/${id}/cashier-password`, {
    method: "PUT",
    body: JSON.stringify({ password }),
  });
