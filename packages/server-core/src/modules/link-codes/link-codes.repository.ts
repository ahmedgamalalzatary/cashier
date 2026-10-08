import { and, eq } from "drizzle-orm";
import type { Db } from "@cashier/db";
import { branches, linkCodes } from "@cashier/db";

export class LinkCodesRepository {
  constructor(private db: Db) {}

  /** Stores only the SHA-256 of the code; the plaintext is never persisted. */
  async insert(codeHash: string, expiresAt: Date, branchId: string) {
    await this.db.insert(linkCodes).values({ codeHash, expiresAt, branchId });
  }

  async existingBranchIds() {
    const rows = await this.db
      .select({ id: branches.id })
      .from(branches)
      .where(and(eq(branches.isActive, true)));
    return rows.map((row) => row.id);
  }
}
