import type { Employee, EmployeePayType } from "@cashier/shared";
import { api } from "../lib/api";

export type EmployeeSaveBody = {
  name?: string;
  phone?: string | null;
  jobTitle?: string | null;
  hireDate?: string | null;
  payType?: EmployeePayType | null;
  payRate?: number | null;
  notes?: string | null;
  isActive?: true;
};

export type CashierAccessBody = {
  username: string;
  password: string;
};

export const listEmployees = () => api<Employee[]>("/api/employees");

export const createEmployee = (body: EmployeeSaveBody) =>
  api<{ id: number }>("/api/employees", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const updateEmployee = (id: number, body: EmployeeSaveBody) =>
  api<{ ok: true }>(`/api/employees/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });

export const deactivateEmployee = (id: number) =>
  api<void>(`/api/employees/${id}`, { method: "DELETE" });

export const grantCashierAccess = (id: number, body: CashierAccessBody) =>
  api<{ userId: number }>(`/api/employees/${id}/cashier-access`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const revokeCashierAccess = (id: number) =>
  api<void>(`/api/employees/${id}/cashier-access`, { method: "DELETE" });
