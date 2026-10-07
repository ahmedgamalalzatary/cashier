import { z } from "zod";

const name = z.string().trim().min(1).max(191);
export const branchInput = z.object({ name }).strict();
export const branchUpdateInput = z
  .object({
    name: name.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((input) => Object.keys(input).length > 0, "حدد التعديل المطلوب");
export type BranchInput = z.infer<typeof branchInput>;
export type BranchUpdateInput = z.infer<typeof branchUpdateInput>;
