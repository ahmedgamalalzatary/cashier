import { z } from "zod";

const password = z.string().min(8).max(255);
// A branch ticked twice must not reach the unique admin_branches key twice.
const branchIds = z
  .array(z.string().uuid())
  .transform((ids) => [...new Set(ids)]);

export const adminInput = z.object({
  name: z.string().trim().min(1).max(191),
  username: z.string().trim().min(1).max(100),
  password,
  branchIds: branchIds.default([]),
});

export const adminUpdateInput = z
  .object({
    name: z.string().trim().min(1).max(191),
    username: z.string().trim().min(1).max(100),
    isActive: z.boolean(),
    password: password.optional(),
    branchIds,
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "لا توجد بيانات للتعديل",
  });

export const adminBranchesInput = z.object({ branchIds });

export type AdminInput = z.infer<typeof adminInput>;
export type AdminUpdateInput = z.infer<typeof adminUpdateInput>;
