import { z } from "zod";

const quantity = z.coerce
  .number()
  .finite()
  .min(0.001)
  .max(99_999_999_999.999)
  .refine((value) => Math.abs(Number(value.toFixed(3)) - value) <= 1e-9, {
    message: "الكمية تقبل ثلاث خانات عشرية كحد أقصى",
  });

const ingredient = z.object({
  itemId: z.coerce.number().int().positive(),
  quantity,
});

const ingredientList = (minimum = 0) =>
  z
    .array(ingredient)
    .min(minimum)
    .max(100)
    .refine(
      (rows) => new Set(rows.map((row) => row.itemId)).size === rows.length,
      { message: "لا يمكن تكرار المكوّن في نفس الهدف" },
    );

const sizeSetup = z.object({
  externalSizeId: z.coerce.number().int().positive(),
  ingredients: ingredientList(1),
});

const modifierSetup = z.discriminatedUnion("stockEffect", [
  z
    .object({
      externalModifierOptionId: z.coerce.number().int().positive(),
      stockEffect: z.literal("none"),
    })
    .strict(),
  z
    .object({
      externalModifierOptionId: z.coerce.number().int().positive(),
      stockEffect: z.literal("mapped"),
      ingredients: ingredientList(1),
    })
    .strict(),
]);

export const productStockSetupInput = z
  .object({
    baseIngredients: ingredientList(),
    sizes: z.array(sizeSetup).max(50),
    modifiers: z.array(modifierSetup).max(500),
  })
  .strict()
  .superRefine((data, context) => {
    if (
      new Set(data.sizes.map((size) => size.externalSizeId)).size !==
      data.sizes.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sizes"],
        message: "لا يمكن تكرار المقاس",
      });
    }
    if (
      new Set(
        data.modifiers.map((modifier) => modifier.externalModifierOptionId),
      ).size !== data.modifiers.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["modifiers"],
        message: "لا يمكن تكرار الإضافة",
      });
    }
  });

export type ProductStockSetupInput = z.infer<typeof productStockSetupInput>;
