import { z } from 'zod';

const MAX_MONEY = 9_999_999_999.99;
const hasTwoDecimalPlaces = (value: number) =>
  Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
const money = (minimum: number) =>
  z.coerce
    .number()
    .finite()
    .min(minimum)
    .max(MAX_MONEY)
    .refine(hasTwoDecimalPlaces, {
      message: 'المبلغ بالقروش كحد أقصى (خانتان عشريتان)',
    });

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
    { message: 'تاريخ غير صالح' },
  );

export const supplierInput = z.object({
  name: z.string().trim().min(1).max(191),
  phone: z.string().trim().max(50).nullish(),
  address: z.string().trim().max(255).nullish(),
  notes: z.string().trim().max(2000).nullish(),
  openingBalance: money(0).default(0),
});

export const supplierUpdateInput = supplierInput
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'لا توجد بيانات للتعديل',
  });

export const paymentInput = z.object({
  amount: money(0.01),
  paidAt: calendarDate,
  notes: z.string().trim().max(255).nullish(),
});

export type SupplierInput = z.infer<typeof supplierInput>;
export type SupplierUpdateInput = z.infer<typeof supplierUpdateInput>;
export type PaymentInput = z.infer<typeof paymentInput>;
