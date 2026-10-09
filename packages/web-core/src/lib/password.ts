import {
  BCRYPT_MAX_PASSWORD_BYTES,
  passwordByteLength,
} from "@cashier/shared";

/**
 * The message every password screen shows when the typed password is longer
 * than bcrypt uses. Blank means the password is fine.
 */
export function passwordTooLongMessage(password: string) {
  if (!password || passwordByteLength(password) <= BCRYPT_MAX_PASSWORD_BYTES)
    return "";
  return `كلمة المرور يجب ألا تتجاوز ${BCRYPT_MAX_PASSWORD_BYTES} بايت، والحروف العربية تُحسب بعدد بايتاتها`;
}