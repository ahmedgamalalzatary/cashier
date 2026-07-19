import { z } from "zod";

const password = z.string().min(8).max(255);
const editableFields = z.object({
  name: z.string().trim().min(1).max(191),
  username: z.string().trim().min(1).max(100),
  role: z.enum(["admin", "cashier"]),
  isActive: z.boolean(),
});

export const userInput = editableFields
  .pick({
    name: true,
    username: true,
    role: true,
  })
  .extend({ password });

export const userUpdateInput = editableFields
  .partial()
  .extend({ password: password.optional() })
  .refine((data) => Object.keys(data).length > 0, {
    message: "لا توجد بيانات للتعديل",
  });

export type UserInput = z.infer<typeof userInput>;
export type UserUpdateInput = z.infer<typeof userUpdateInput>;
