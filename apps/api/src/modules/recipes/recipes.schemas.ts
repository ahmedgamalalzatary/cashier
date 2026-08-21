import { z } from "zod";

const MAX_QUANTITY = 99_999_999_999.999;
const hasAtMostPlaces = (places: number) => (value: number) =>
  Math.abs(Number(value.toFixed(places)) - value) <= 1e-9;

const quantity = z.coerce
  .number()
  .finite()
  .min(0.001)
  .max(MAX_QUANTITY)
  .refine(hasAtMostPlaces(3), {
    message: "الكمية تقبل ثلاث خانات عشرية كحد أقصى",
  });

const ingredient = z.object({
  itemId: z.coerce.number().int().positive(),
  quantity,
});

const ingredients = z
  .array(ingredient)
  .min(1)
  .max(100)
  .refine(
    (rows) => new Set(rows.map((row) => row.itemId)).size === rows.length,
    { message: "لا يمكن تكرار المكوّن في نفس الوصفة" },
  );

export const recipeInput = z
  .object({
    name: z.string().trim().min(1).max(191),
    categoryId: z.coerce.number().int().positive(),
    type: z.literal("prepared"),
    outputItemId: z.coerce.number().int().positive(),
    baseYield: quantity,
    ingredients,
  })
  .strict();

export const preparationInput = z
  .object({
    quantity,
    notes: z.preprocess(
      (value) =>
        typeof value === "string" && value.trim() === "" ? null : value,
      z.string().trim().min(1).max(2000).nullish(),
    ),
  })
  .strict();

export type RecipeInput = z.infer<typeof recipeInput>;
export type PreparationInput = z.infer<typeof preparationInput>;
