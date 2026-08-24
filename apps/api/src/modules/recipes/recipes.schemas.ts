import { z } from 'zod';

const MAX_QUANTITY = 99_999_999_999.999;
const MAX_MONEY = 9_999_999_999.99;
const hasAtMostPlaces = (places: number) => (value: number) =>
  Math.abs(Number(value.toFixed(places)) - value) <= 1e-9;

const quantity = z.coerce
  .number()
  .finite()
  .min(0.001)
  .max(MAX_QUANTITY)
  .refine(hasAtMostPlaces(3), {
    message: 'الكمية تقبل ثلاث خانات عشرية كحد أقصى',
  });

const money = z.coerce
  .number()
  .finite()
  .min(0.01)
  .max(MAX_MONEY)
  .refine(hasAtMostPlaces(2), {
    message: 'السعر يقبل خانتين عشريتين كحد أقصى',
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
    { message: 'لا يمكن تكرار المكوّن في نفس المقاس' },
  );

const productSize = z.object({
  name: z.string().trim().min(1).max(100),
  sellingPrice: money,
  ingredients,
});

const common = {
  name: z.string().trim().min(1).max(191),
  categoryId: z.coerce.number().int().positive(),
};

const productRecipeInput = z
  .object({
    ...common,
    type: z.literal('product'),
    sizes: z.array(productSize).min(1).max(20),
  })
  .strict();

const preparedRecipeInput = z
  .object({
    ...common,
    type: z.literal('prepared'),
    outputItemId: z.coerce.number().int().positive(),
    baseYield: quantity,
    ingredients,
  })
  .strict();

export const recipeInput = z
  .discriminatedUnion('type', [productRecipeInput, preparedRecipeInput])
  .superRefine((data, context) => {
    if (
      data.type === 'product' &&
      new Set(data.sizes.map((size) => size.name.toLocaleLowerCase('ar')))
        .size !== data.sizes.length
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'لا يمكن تكرار اسم المقاس',
        path: ['sizes'],
      });
    }
  });

export const preparationInput = z
  .object({
    quantity,
    notes: z.preprocess(
      (value) =>
        typeof value === 'string' && value.trim() === '' ? null : value,
      z.string().trim().min(1).max(2000).nullish(),
    ),
  })
  .strict();

export type RecipeInput = z.infer<typeof recipeInput>;
export type PreparationInput = z.infer<typeof preparationInput>;
