import { z } from "zod";

export const loginInput = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(255),
});

export const changePasswordInput = z.object({
  currentPassword: z.string().min(1).max(255),
  newPassword: z.string().min(8).max(255),
});

export type LoginInput = z.infer<typeof loginInput>;
export type ChangePasswordInput = z.infer<typeof changePasswordInput>;
