import { z } from "zod";

const name = z.string().trim().min(1).max(191);

export const createExpenseCategoryInput = z.object({ name });
export const updateExpenseCategoryInput = z
  .object({ name: name.optional(), isActive: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0);

export const createExpenseInput = z.object({
  clientRequestId: z.string().uuid(),
  categoryId: z.number().int().positive(),
  amount: z
    .number()
    .positive()
    .max(9_999_999_999.99)
    .refine((value) => Number(value.toFixed(2)) === value),
  expenseDate: z.string().date().optional(),
  note: z.string().trim().max(500).nullable().default(null),
});

export type CreateExpenseInput = z.infer<typeof createExpenseInput>;
