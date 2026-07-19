import { z } from 'zod';

export const supplierInput = z.object({
  name: z.string().trim().min(1).max(191),
  phone: z.string().trim().max(50).nullish(),
  address: z.string().trim().max(255).nullish(),
  notes: z.string().trim().max(2000).nullish(),
  openingBalance: z.coerce.number().min(0).default(0),
});

export const supplierUpdateInput = supplierInput
  .partial()
  .refine((data) => Object.keys(data).length > 0, { message: 'لا توجد بيانات للتعديل' });

// money has at most 2 fractional digits (tolerance for float representation)
const money = (v: number) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;

export const paymentInput = z.object({
  amount: z.coerce.number().positive().refine(money, { message: 'المبلغ بالقروش كحد أقصى (خانتان عشريتان)' }),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().trim().max(255).nullish(),
});

export const idParam = z.coerce.number().int().positive();

export type SupplierInput = z.infer<typeof supplierInput>;
export type SupplierUpdateInput = z.infer<typeof supplierUpdateInput>;
export type PaymentInput = z.infer<typeof paymentInput>;
