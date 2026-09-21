import { z } from "zod";

const coerceNumber = (value: unknown) =>
  typeof value === "string" || typeof value === "number"
    ? Number(value)
    : value;
const id = z.preprocess(coerceNumber, z.number().int().positive());
const quantity = z
  .preprocess(coerceNumber, z.number().min(0).max(99_999_999_999.999))
  .refine(
    (value) => Math.abs(value - Number(value.toFixed(3))) < 1e-9,
    "الكمية لا تقبل أكثر من ثلاث خانات عشرية",
  );
const note = z.string().trim().min(1).max(500);

export const startStocktakeInput = z.object({
  warehouse: z.enum(["main", "cafe"]),
  categoryId: id.nullable().default(null),
  note: z.string().trim().max(500).nullable().default(null),
});

export const updateStocktakeCountsInput = z
  .object({
    lines: z.array(z.object({ itemId: id, countedQuantity: quantity })).min(1),
  })
  .superRefine(({ lines }, context) => {
    const seen = new Set<number>();
    lines.forEach((line, index) => {
      if (seen.has(line.itemId))
        context.addIssue({
          code: "custom",
          path: ["lines", index, "itemId"],
          message: "الصنف مكرر",
        });
      seen.add(line.itemId);
    });
  });

export const confirmStocktakeInput = z.object({ note });

export const manualAdjustmentInput = z.object({
  warehouse: z.enum(["main", "cafe"]),
  itemId: id,
  countedQuantity: quantity,
  note,
});

export type StartStocktakeInput = z.infer<typeof startStocktakeInput>;
export type UpdateStocktakeCountsInput = z.infer<
  typeof updateStocktakeCountsInput
>;
export type ConfirmStocktakeInput = z.infer<typeof confirmStocktakeInput>;
export type ManualAdjustmentInput = z.infer<typeof manualAdjustmentInput>;
