import { z } from 'zod';

export const categoryInput = z.object({
  name: z.string().trim().min(1).max(191),
  parentId: z.coerce.number().int().positive().nullish(),
});

export const categoryUpdateInput = categoryInput
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'لا توجد بيانات للتعديل',
  });

export type CategoryInput = z.infer<typeof categoryInput>;
export type CategoryUpdateInput = z.infer<typeof categoryUpdateInput>;
