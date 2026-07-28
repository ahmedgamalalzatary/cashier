import { z } from "zod";

const hasDecimalPlaces = (places: number) => (value: number) =>
  Math.abs(value * 10 ** places - Math.round(value * 10 ** places)) < 1e-6;

const sellingPrice = z.coerce
  .number()
  .finite()
  .positive()
  .max(9_999_999_999.99)
  .refine(hasDecimalPlaces(2), {
    message: "سعر البيع يقبل خانتين عشريتين كحد أقصى",
  });

const barcode = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().trim().min(1).max(191).nullish(),
);

const variantInput = z.object({
  id: z.coerce.number().int().positive().optional(),
  colorId: z.coerce.number().int().positive(),
  sizeId: z.coerce.number().int().positive(),
  barcode,
  sellingPrice,
  isActive: z.boolean().optional(),
});

const variants = z
  .array(variantInput)
  .min(1)
  .max(500)
  .superRefine((rows, context) => {
    const combinations = new Set<string>();
    const barcodes = new Set<string>();
    rows.forEach((row, index) => {
      const combination = `${row.colorId}:${row.sizeId}`;
      if (combinations.has(combination)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index],
          message: "لا يمكن تكرار نفس اللون والمقاس",
        });
      }
      combinations.add(combination);
      if (row.barcode) {
        const normalized = row.barcode.toLocaleLowerCase("ar");
        if (barcodes.has(normalized)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, "barcode"],
            message: "الباركود مكرر",
          });
        }
        barcodes.add(normalized);
      }
    });
  });

const productFields = z.object({
  name: z.string().trim().min(1).max(191),
  categoryId: z.coerce.number().int().positive(),
  variants,
});

export const itemInput = productFields;

export const itemUpdateInput = productFields
  .partial()
  .extend({ isActive: z.literal(true).optional() })
  .refine((data) => Object.keys(data).length > 0, {
    message: "لا توجد بيانات للتعديل",
  });

export type VariantInput = z.infer<typeof variantInput>;
export type ItemInput = z.infer<typeof itemInput>;
export type ItemUpdateInput = z.infer<typeof itemUpdateInput>;
