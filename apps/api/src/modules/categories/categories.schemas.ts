import { z } from "zod";

const optionNames = z
  .array(z.string().trim().min(1).max(100))
  .min(1)
  .max(100)
  .superRefine((names, context) => {
    const seen = new Set<string>();
    names.forEach((name, index) => {
      const normalized = name.toLocaleLowerCase("ar");
      if (seen.has(normalized)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index],
          message: "لا يمكن تكرار القيمة",
        });
      }
      seen.add(normalized);
    });
  });

export const categoryInput = z.object({
  name: z.string().trim().min(1).max(191),
  parentId: z.coerce.number().int().positive().nullish(),
  colors: optionNames,
  sizes: optionNames,
});

export const categoryUpdateInput = categoryInput
  .partial()
  .extend({ isActive: z.literal(true).optional() })
  .refine((data) => Object.keys(data).length > 0, {
    message: "لا توجد بيانات للتعديل",
  });

export type CategoryInput = z.infer<typeof categoryInput>;
export type CategoryUpdateInput = z.infer<typeof categoryUpdateInput>;
