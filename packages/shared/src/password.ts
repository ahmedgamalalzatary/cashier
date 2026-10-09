// bcrypt hashes only the first 72 bytes of a password, so two passwords that
// agree on those bytes and differ afterwards both sign in. The limit is
// counted in UTF-8 bytes, not characters: Arabic and emoji reach it sooner.
export const BCRYPT_MAX_PASSWORD_BYTES = 72;

export function passwordByteLength(password: string) {
  // Counted per code point so the answer matches what bcrypt's UTF-8 input
  // receives, without needing Buffer (this package runs without node types).
  let bytes = 0;
  for (const character of password) {
    const code = character.codePointAt(0) ?? 0;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/**
 * Reports a password that is already longer than bcrypt's limit instead of
 * refusing it, because refusing would stop an installation that is running
 * today from starting. New passwords are refused; see `newPassword`.
 */
export function warnIfPasswordTooLongForBcrypt(
  password: string,
  where: string,
) {
  if (passwordByteLength(password) > BCRYPT_MAX_PASSWORD_BYTES)
    console.warn(
      `${where} is longer than bcrypt's ${BCRYPT_MAX_PASSWORD_BYTES}-byte limit, so only its first ${BCRYPT_MAX_PASSWORD_BYTES} bytes are used to sign in. Shorten it to remove the ambiguity.`,
    );
}