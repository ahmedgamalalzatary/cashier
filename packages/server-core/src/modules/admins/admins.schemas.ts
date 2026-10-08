import { z } from "zod";

const password = z.string().min(8).max(255);

export const adminInput = z.object({
  name: z.string().trim().min(1).max(191),
  username: z.string().trim().min(1).max(100),
  role: z.literal("admin"),
  password,
  branchIds: z.array(z.string()).default([]),
});

export const adminUpdateInput = z
  .object({
    name: z.string().trim().min(1).max(191),
    username: z.string().trim().min(1).max(100),
    isActive: z.boolean(),
    password: password.optional(),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "لا توجد بيانات للتعديل",
  });

export const adminBranchesInput = z.object({
  branchIds: z.array(z.string()),
});

export type AdminInput = z.infer<typeof adminInput>;
export type AdminUpdateInput = z.infer<typeof adminUpdateInput>;
