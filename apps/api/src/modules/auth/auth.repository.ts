import { eq, sql, getTableColumns } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { branches, users } from "../../db/schema.js";

export class AuthRepository {
  constructor(private db: Db) {}

  async findByUsername(username: string) {
    const [row] = await this.db
      .select({ ...getTableColumns(users), branchIsActive: branches.isActive })
      .from(users)
      .leftJoin(branches, eq(users.branchId, branches.id))
      .where(eq(users.username, username))
      .limit(1);
    return row;
  }

  async findById(id: number) {
    const [row] = await this.db
      .select({ ...getTableColumns(users), branchIsActive: branches.isActive })
      .from(users)
      .leftJoin(branches, eq(users.branchId, branches.id))
      .where(eq(users.id, id))
      .limit(1);
    return row;
  }

  async updatePassword(id: number, passwordHash: string) {
    await this.db
      .update(users)
      .set({
        passwordHash,
        tokenVersion: sql`${users.tokenVersion} + 1`,
      })
      .where(eq(users.id, id));
  }
}
