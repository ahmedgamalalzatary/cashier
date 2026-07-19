import { eq, sql } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { users } from "../../db/schema.js";

export class AuthRepository {
  constructor(private db: Db) {}

  async findByUsername(username: string) {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);
    return row;
  }

  async findById(id: number) {
    const [row] = await this.db
      .select()
      .from(users)
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
