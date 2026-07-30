import type { ExpenseCategory, ExpenseSummary } from "@cashier/shared";
import { api } from "../lib/api";

export const listExpenseCategories = () =>
  api<ExpenseCategory[]>("/api/expenses/categories");
export const createExpenseCategory = (name: string) =>
  api<ExpenseCategory>("/api/expenses/categories", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
export const updateExpenseCategory = (
  id: number,
  body: { name?: string; isActive?: boolean },
) =>
  api<ExpenseCategory>(`/api/expenses/categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
export const listExpenses = () => api<ExpenseSummary[]>("/api/expenses");
export const createExpense = (body: {
  clientRequestId: string;
  categoryId: number;
  amount: number;
  expenseDate?: string;
  note: string | null;
}) =>
  api<ExpenseSummary>("/api/expenses", {
    method: "POST",
    body: JSON.stringify(body),
  });
