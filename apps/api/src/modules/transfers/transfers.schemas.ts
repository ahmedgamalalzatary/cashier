import { z } from 'zod';

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

const transferLineInput = z.object({
  itemId: z.coerce.number().int().positive(),
  quantity,
});

const hasUniqueLines = (data: { lines: Array<{ itemId: number }> }) =>
  new Set(data.lines.map((line) => line.itemId)).size === data.lines.length;

export const transferRequestInput = z
  .object({
    notes: optionalText(2000),
    lines: z.array(transferLineInput).min(1).max(100),
  })
  .refine(hasUniqueLines, {
    message: 'لا يمكن تكرار الصنف في التحويل',
    path: ['lines'],
  });

export const transferApprovalInput = z
  .object({
    lines: z.array(transferLineInput).min(1).max(100),
  })
  .refine(hasUniqueLines, {
    message: 'لا يمكن تكرار الصنف في التحويل',
    path: ['lines'],
  });

export const transferRejectionInput = z.object({
  reason: z.string().trim().min(1).max(500),
});

export type TransferRequestInput = z.infer<typeof transferRequestInput>;
export type TransferApprovalInput = z.infer<typeof transferApprovalInput>;
