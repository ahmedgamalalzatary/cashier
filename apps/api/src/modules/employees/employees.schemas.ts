import { z } from "zod";

const MAX_MONEY = 9_999_999_999.99;
const MONEY_EPSILON = 1e-9;
const optionalText = (maximum: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? null : value,
    z.string().trim().min(1).max(maximum).nullish(),
  );
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) => {
      const parsed = new Date(`${value}T00:00:00.000Z`);
      return (
        !Number.isNaN(parsed.valueOf()) &&
        parsed.toISOString().slice(0, 10) === value
      );
    },
    { message: "تاريخ غير صالح" },
  );
const payRate = z.coerce
  .number()
  .finite()
  .min(0)
  .max(MAX_MONEY)
  .refine(
    (value) => Math.abs(Number(value.toFixed(2)) - value) <= MONEY_EPSILON,
    { message: "المبلغ بالقروش كحد أقصى" },
  );

const employeeFields = z.object({
  name: z.string().trim().min(1).max(191),
  phone: optionalText(50),
  jobTitle: optionalText(100),
  hireDate: z.preprocess(
    (value) => (value === "" ? null : value),
    calendarDate.nullish(),
  ),
  /** monthly salary — absent or null means it was never set */
  payRate: payRate.nullish().default(null),
  /**
   * Payroll is monthly only, so a pay type is a dead field. Rejecting it stops a
   * stale client from silently storing a daily rate as a monthly salary.
   */
  payType: z.never({ message: "نوع الأجر غير مدعوم؛ الراتب شهري فقط" }).optional(),
  notes: optionalText(2000),
});

export const employeeInput = employeeFields;

export type EmployeeInput = z.infer<typeof employeeInput>;

export const employeeUpdateInput = employeeFields
  .partial()
  .extend({ isActive: z.literal(true).optional() })
  .superRefine((data, context) => {
    if (Object.keys(data).length === 0) {
      context.addIssue({
        code: "custom",
        message: "لا توجد بيانات للتعديل",
      });
    }
  });

export type EmployeeUpdateInput = z.infer<typeof employeeUpdateInput>;

export const cashierAccessInput = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(8).max(255),
});

export const cashierPasswordInput = z.object({
  password: z.string().min(8).max(255),
});

export const employeeIdParam = z.coerce.number().int().positive();

export type CashierAccessInput = z.infer<typeof cashierAccessInput>;
export type CashierPasswordInput = z.infer<typeof cashierPasswordInput>;
