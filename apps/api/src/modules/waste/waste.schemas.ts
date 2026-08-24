import { z } from "zod";

const quantity = z
  .number()
  .positive()
  .max(99_999_999_999.999)
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
        itemId: z.number().int().positive(),
      }),
      z.object({
        type: z.literal("recipe"),
        recipeSizeId: z.number().int().positive(),
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
    if (value.target.type === "recipe" && !Number.isInteger(value.quantity)) {
      context.addIssue({
        code: "custom",
        path: ["quantity"],
        message: "كمية منتج الوصفة يجب أن تكون عدداً صحيحاً",
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
