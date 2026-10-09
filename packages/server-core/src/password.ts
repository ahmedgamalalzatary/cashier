import { z } from "zod";
import {
  BCRYPT_MAX_PASSWORD_BYTES,
  passwordByteLength,
} from "@cashier/shared";

/**
 * A password someone is setting now. Sign-in deliberately keeps accepting
 * longer input, so accounts created before this limit was enforced are not
 * locked out.
 */
export const newPassword = z
  .string()
  .min(8)
  .max(255)
  .refine((value) => passwordByteLength(value) <= BCRYPT_MAX_PASSWORD_BYTES, {
    message: `كلمة المرور يجب ألا تتجاوز ${BCRYPT_MAX_PASSWORD_BYTES} بايت، والحروف العربية تُحسب بعدد بايتاتها`,
  });

export { BCRYPT_MAX_PASSWORD_BYTES };