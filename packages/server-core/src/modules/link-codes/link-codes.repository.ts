import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@cashier/db";
import { branches, linkCodes } from "@cashier/db";

export class LinkCodesRepository {
  constructor(private db: Db) {}

  /**
   * Stores only the SHA-256 of the code; the plaintext is never persisted. A new
   * code cancels the branch's unused ones, so only the latest code can link a
   * PC. Used codes stay as the record of past links.
   */
  async replaceUnused(codeHash: string, expiresAt: Date, branchId: string) {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(linkCodes)
        .where(and(eq(linkCodes.branchId, branchId), isNull(linkCodes.usedAt)));
      await tx.insert(linkCodes).values({ codeHash, expiresAt, branchId });
    });
  }

  async existingBranchIds() {
    const rows = await this.db
      .select({ id: branches.id })
      .from(branches)
      .where(eq(branches.isActive, true));
    return rows.map((row) => row.id);
  }
}
