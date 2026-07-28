import { z } from "zod";

const money = z.coerce
  .number()
  .finite()
  .min(0)
  .max(9_999_999_999.99)
  .refine((value) => Math.abs(Number(value.toFixed(2)) - value) <= 1e-9);
const quantity = z.coerce
  .number()
  .finite()
  .positive()
  .max(99_999_999_999.999)
  .refine((value) => Math.abs(Number(value.toFixed(3)) - value) <= 1e-9);
const optionalText = (maximum: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().min(1).max(maximum).nullish(),
  );
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(parsed.valueOf()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  });

const purchaseLineInput = z.object({
  variantId: z.coerce.number().int().positive(),
  quantity,
  unitPrice: money,
});

export const purchaseInput = z
  .object({
    supplierId: z.coerce.number().int().positive(),
    invoiceNumber: optionalText(100),
    purchasedAt: calendarDate,
    paidAmount: money.default(0),
    notes: optionalText(2000),
    lines: z.array(purchaseLineInput).min(1).max(500),
  })
  .refine(
    (data) =>
      new Set(data.lines.map((line) => line.variantId)).size ===
      data.lines.length,
    { message: "لا يمكن تكرار نفس المتغير في الفاتورة", path: ["lines"] },
  );

export type PurchaseInput = z.infer<typeof purchaseInput>;
export type PurchaseLineInput = z.infer<typeof purchaseLineInput>;
