export type ExpenseCategory = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
};

export type ExpenseSummary = {
  id: string;
  type: "shift" | "general";
  categoryId: string;
  categoryName: string;
  shiftId: string | null;
  amount: string;
  expenseDate: string;
  note: string | null;
  recordedBy: string;
  recordedByName: string;
  createdAt: string;
};
