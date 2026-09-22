import { z } from "zod";

const money = z.coerce
  .number()
  .finite()
  .positive()
  .max(9_999_999_999.99)
  .refine(
    (value) => Number(value.toFixed(2)) === value,
    "المبلغ بالقروش كحد أقصى",
  );
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
      !Number.isNaN(parsed.valueOf()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "تاريخ غير صالح");
const note = z.preprocess(
  (value) => (value === "" ? null : value),
  z.string().trim().min(1).max(500).nullish(),
);

export const monthParam = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const employeeIdParam = z.coerce.number().int().positive();
export const advanceInput = z.object({
  employeeId: employeeIdParam,
  amount: money,
  entryDate: date,
  note,
});
export const adjustmentInput = advanceInput.extend({
  type: z.enum(["bonus", "deduction"]),
});
export const paymentInput = z.object({
  employeeId: employeeIdParam,
  month: monthParam,
});
export type AdvanceInput = z.infer<typeof advanceInput>;
export type AdjustmentInput = z.infer<typeof adjustmentInput>;
