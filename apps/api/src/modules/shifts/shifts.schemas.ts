import { z } from "zod";

const MAX_MONEY = 9_999_999_999.99;
const MONEY_EPSILON = 1e-9;

export const money = z
  .number()
  .finite()
  .min(0)
  .max(MAX_MONEY)
  .refine(
    (value) => Math.abs(Number(value.toFixed(2)) - value) <= MONEY_EPSILON,
    { message: "المبلغ بالقروش كحد أقصى" },
  );

export const openShiftInput = z.object({
  openingFloat: money,
});

export const closeShiftInput = z.object({
  actualCash: money,
});

export const adminCloseShiftInput = closeShiftInput.extend({
  note: z.string().trim().min(1).max(500),
});

export const shiftAuditNoteInput = z.object({
  note: z.string().trim().min(1).max(500),
});

export const correctShiftInput = z
  .object({
    openingFloat: money.optional(),
    actualCash: money.optional(),
    note: z.string().trim().min(1).max(500),
  })
  .refine(
    (data) => data.openingFloat !== undefined || data.actualCash !== undefined,
    {
      message: "يجب إدخال قيمة واحدة على الأقل للتصحيح",
    },
  );

export const shiftIdParam = z.coerce.number().int().positive();

export type OpenShiftInput = z.infer<typeof openShiftInput>;
export type CloseShiftInput = z.infer<typeof closeShiftInput>;
export type AdminCloseShiftInput = z.infer<typeof adminCloseShiftInput>;
export type ShiftAuditNoteInput = z.infer<typeof shiftAuditNoteInput>;
export type CorrectShiftInput = z.infer<typeof correctShiftInput>;
