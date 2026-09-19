import { describe, expect, it } from "vitest";
import {
  createExpenseCategoryInput,
  createExpenseInput,
  updateExpenseCategoryInput,
} from "../../src/modules/expenses/expenses.schemas.js";

const validExpense = {
  clientRequestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  categoryId: 3,
  amount: 12.5,
  expenseDate: "2026-07-20",
  note: "كهرباء",
};

describe("create expense schema", () => {
  it("accepts a valid expense and defaults note to null", () => {
    const { note, ...withoutNote } = validExpense;

    expect(createExpenseInput.parse(validExpense).amount).toBe(12.5);
    expect(createExpenseInput.parse(withoutNote).note).toBeNull();
    void note;
  });

  it("rejects bad amounts, ids, dates, and request ids", () => {
    for (const amount of [0, -1, 12.555, 10_000_000_000]) {
      expect(
        createExpenseInput.safeParse({ ...validExpense, amount }).success,
        `amount ${String(amount)}`,
      ).toBe(false);
    }
    expect(
      createExpenseInput.safeParse({ ...validExpense, categoryId: 0 }).success,
    ).toBe(false);
    expect(
      createExpenseInput.safeParse({ ...validExpense, categoryId: 1.5 })
        .success,
    ).toBe(false);
    expect(
      createExpenseInput.safeParse({
        ...validExpense,
        clientRequestId: "not-a-uuid",
      }).success,
    ).toBe(false);
    expect(
      createExpenseInput.safeParse({
        ...validExpense,
        expenseDate: "2026-02-30",
      }).success,
    ).toBe(false);
    expect(
      createExpenseInput.safeParse({
        ...validExpense,
        note: "x".repeat(501),
      }).success,
    ).toBe(false);
  });
});

describe("expense category schemas", () => {
  it("rejects blank and over-long names", () => {
    expect(
      createExpenseCategoryInput.safeParse({ name: "   " }).success,
    ).toBe(false);
    expect(
      createExpenseCategoryInput.safeParse({ name: "x".repeat(192) }).success,
    ).toBe(false);
    expect(
      createExpenseCategoryInput.parse({ name: "  نظافة  " }).name,
    ).toBe("نظافة");
  });

  it("rejects empty updates but accepts single-field ones", () => {
    expect(updateExpenseCategoryInput.safeParse({}).success).toBe(false);
    expect(
      updateExpenseCategoryInput.parse({ isActive: false }),
    ).toEqual({ isActive: false });
  });
});
