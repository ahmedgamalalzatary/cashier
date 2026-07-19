import { eq } from 'drizzle-orm';
import type { Db } from '../../db/index.js';
import { users } from '../../db/schema.js';

export class AuthRepository {
  constructor(private db: Db) {}

  async findByUsername(username: string) {
    const [row] = await this.db.select().from(users).where(eq(users.username, username));
    return row;
  }
}
