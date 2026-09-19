import { z } from "zod";

// z.coerce.number() converts booleans (true -> 1), so only coerce genuine
// form-data inputs: strings and numbers. Anything else passes through for
// z.number() to reject.
const coerceStrictNumber = (value: unknown) =>
  typeof value === "string" || typeof value === "number"
    ? Number(value)
    : value;

const quantity = z
  .preprocess(
    coerceStrictNumber,
    z.number().positive().max(99_999_999_999.999),
  )
  .refine(
    (value) => Math.abs(value - Number(value.toFixed(3))) < 1e-9,
    "الكمية لا تقبل أكثر من ثلاث خانات عشرية",
  );

export const wasteInput = z
  .object({
    clientRequestId: z.string().uuid(),
    warehouse: z.enum(["main", "cafe"]),
    target: z.discriminatedUnion("type", [
      z.object({
        type: z.literal("item"),
        itemId: z.preprocess(coerceStrictNumber, z.number().int().positive()),
      }),
      z.object({
        type: z.literal("external_product"),
        externalProductId: z.preprocess(
          coerceStrictNumber,
          z.number().int().positive(),
        ),
        externalSizeId: z.preprocess(
          coerceStrictNumber,
          z.number().int().positive().nullable(),
        ),
      }),
      z.object({
        type: z.literal("recipe"),
        recipeId: z.preprocess(coerceStrictNumber, z.number().int().positive()),
        recipeSizeId: z.preprocess(
          coerceStrictNumber,
          z.number().int().positive(),
        ),
      }),
    ]),
    quantity,
    reason: z.enum([
      "expired",
      "damaged",
      "preparation_mistake",
      "spill",
      "other",
    ]),
    note: z.string().trim().max(500).nullable().default(null),
  })
  .superRefine((value, context) => {
    if (
      (value.target.type === "external_product" ||
        value.target.type === "recipe") &&
      !Number.isInteger(value.quantity)
    ) {
      context.addIssue({
        code: "custom",
        path: ["quantity"],
        message:
          value.target.type === "recipe"
            ? "كمية الوصفة يجب أن تكون عدداً صحيحاً"
            : "كمية المنتج يجب أن تكون عدداً صحيحاً",
      });
    }
    if (value.reason === "other" && !value.note) {
      context.addIssue({
        code: "custom",
        path: ["note"],
        message: "اكتب سبب الهالك",
      });
    }
  });

export type WasteInput = z.infer<typeof wasteInput>;
