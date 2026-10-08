import { createHash, randomBytes } from "node:crypto";
import { HttpError } from "../../middleware/error.js";
import { hashCode } from "../link-codes/link-codes.service.js";
import type { DeviceLinkRepository } from "./device-link.repository.js";

// Same alphabet and length the link-code screen hands out (plan 7.4).
const CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;
// One message for every refusal, so a guess learns nothing about real codes.
const INVALID_CODE = "كود الربط غير صحيح أو منتهي الصلاحية";

export function hashDeviceToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Links a shop PC to the branch its one-time code was made for (plan Phase 9).
 * The PC receives its device token once; online keeps only the token's hash.
 */
export class DeviceLinkService {
  constructor(
    private repo: DeviceLinkRepository,
    private now: () => Date = () => new Date(),
  ) {}

  async link(rawCode: string) {
    // People type codes from a screen: forgive case, spaces and a dash.
    const code = rawCode.replace(/[\s-]/g, "").toUpperCase();
    if (!CODE_PATTERN.test(code)) throw new HttpError(400, INVALID_CODE);

    const codeHash = hashCode(code);
    const at = this.now();
    const deviceToken = randomBytes(32).toString("base64url");
    const branch = await this.repo.transaction(async (repo) => {
      const found = await repo.findCodeForUpdate(codeHash);
      if (
        !found ||
        found.usedAt ||
        found.expiresAt.getTime() <= at.getTime() ||
        !found.branchIsActive
      )
        throw new HttpError(400, INVALID_CODE);
      await repo.markCodeUsed(codeHash, at);
      await repo.replaceDevice(
        found.branchId,
        hashDeviceToken(deviceToken),
        at,
      );
      return { id: found.branchId, name: found.branchName };
    });
    return { deviceToken, branch };
  }
}
