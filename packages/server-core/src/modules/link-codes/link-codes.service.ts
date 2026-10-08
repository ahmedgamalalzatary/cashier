import { createHash, randomBytes } from "node:crypto";
import type { AuthUser } from "@cashier/shared";
import { HttpError } from "../../middleware/error.js";
import type { LinkCodesRepository } from "./link-codes.repository.js";

// No look-alikes: 0/O, 1/I/L are left out so a code read aloud or typed from a
// screen cannot be mistyped into a different branch.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;
const TTL_MS = 24 * 60 * 60 * 1000;

const SUPER_ADMIN_ONLY = "أكواد الربط متاحة للمدير الرئيسي فقط";

export function generateCode() {
  const bytes = randomBytes(CODE_LENGTH);
  let code = "";
  for (let index = 0; index < CODE_LENGTH; index += 1)
    code += ALPHABET[bytes[index]! % ALPHABET.length];
  return code;
}

export function hashCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

/**
 * Link codes are generated online only (plan Phase 8.3). The code is returned
 * once here and never again: only its hash is stored, so a leaked database row
 * cannot be turned back into a usable code.
 */
export class LinkCodesService {
  constructor(private repo: LinkCodesRepository) {}

  async generate(actor: AuthUser, data: { branchId: string }) {
    if (!actor.isSuperAdmin) throw new HttpError(403, SUPER_ADMIN_ONLY);
    if (!(await this.repo.existingBranchIds()).includes(data.branchId))
      throw new HttpError(404, "أحد الفروع غير موجود");

    const code = generateCode();
    const expiresAt = new Date(Date.now() + TTL_MS);
    await this.repo.replaceUnused(hashCode(code), expiresAt, data.branchId);
    return { code, expiresAt };
  }
}
