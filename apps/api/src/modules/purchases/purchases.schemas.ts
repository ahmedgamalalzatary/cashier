import { z } from 'zod';

const MAX_MONEY = 9_999_999_999.99;
const hasTwoDecimalPlaces = (value: number) =>
  Math.abs(Number(value.toFixed(2)) - value) <= 1e-9;
const money = z.coerce
  .number()
  .finite()
  .min(0)
  .max(MAX_MONEY)
  .refine(hasTwoDecimalPlaces, {
    message: 'المبلغ يقبل خانتين عشريتين كحد أقصى',
  });
const quantity = z.coerce
  .number()
  .finite()
  .positive()
  .max(99_999_999_999.999)
  .refine((value) => Math.abs(Number(value.toFixed(3)) - value) <= 1e-9, {
    message: 'الكمية تقبل ثلاث خانات عشرية كحد أقصى',
  });
const optionalText = (maximum: number) =>
  z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim() === '' ? null : value,
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
    { message: 'تاريخ غير صالح' },
  );

const purchaseLineInput = z.object({
  itemId: z.coerce.number().int().positive(),
  quantity,
  unitMode: z.enum(['stock', 'purchase']),
  unitPrice: money,
});

export const purchaseInput = z
  .object({
    supplierId: z.coerce.number().int().positive(),
    invoiceNumber: optionalText(100),
    purchasedAt: calendarDate,
    paidAmount: money.default(0),
    notes: optionalText(2000),
    lines: z.array(purchaseLineInput).min(1).max(100),
  })
  .refine(
    (data) =>
      new Set(data.lines.map((line) => line.itemId)).size === data.lines.length,
    { message: 'لا يمكن تكرار الصنف في الفاتورة', path: ['lines'] },
  );

export type PurchaseInput = z.infer<typeof purchaseInput>;
export type PurchaseLineInput = z.infer<typeof purchaseLineInput>;
