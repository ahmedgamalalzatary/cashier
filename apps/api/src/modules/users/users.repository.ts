import { eq } from "drizzle-orm";
import type { Db } from "../../db/index.js";
import { users } from "../../db/schema.js";
import type { UserInput, UserUpdateInput } from "./users.schemas.js";

const safeUserColumns = {
  id: users.id,
  name: users.name,
  username: users.username,
  role: users.role,
  isActive: users.isActive,
  createdAt: users.createdAt,
};

export class UsersRepository {
  constructor(private db: Db) {}

  transaction<T>(fn: (repo: UsersRepository) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) =>
      fn(new UsersRepository(tx as unknown as Db)),
    );
  }

  list() {
    return this.db.select(safeUserColumns).from(users).orderBy(users.name);
  }

  async findByIdForUpdate(id: number) {
    const [row] = await this.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .for("update");
    return row;
  }

  async create(data: UserInput, passwordHash: string) {
    const [result] = await this.db.insert(users).values({
      name: data.name,
      username: data.username,
      role: data.role,
      passwordHash,
    });
    return result.insertId;
  }

  async update(
    id: number,
    data: Omit<UserUpdateInput, "password"> & { passwordHash?: string },
  ) {
    await this.db.update(users).set(data).where(eq(users.id, id));
  }
}
