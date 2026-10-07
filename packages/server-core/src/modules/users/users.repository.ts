import { and, eq, or, sql } from "drizzle-orm";
import { currentBranchId } from "@cashier/db";
import type { Db } from "@cashier/db";
import { users } from "@cashier/db";
import type { UserInput, UserUpdateInput } from "./users.schemas.js";

const safeUserColumns = {
  id: users.id,
  name: users.name,
  username: users.username,
  role: users.role,
  branchId: sql<
    string | null
  >`CASE WHEN ${users.role}='cashier' THEN ${users.branchId} ELSE NULL END`,
  isActive: users.isActive,
  isSuperAdmin: users.isSuperAdmin,
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
    return this.db
      .select(safeUserColumns)
      .from(users)
      .where(or(eq(users.role, "admin"), eq(users.branchId, currentBranchId())))
      .orderBy(users.name);
  }

  async findByIdForUpdate(id: string) {
    const [row] = await this.db
      .select()
      .from(users)
      .where(
        and(
          eq(users.id, id),
          or(eq(users.role, "admin"), eq(users.branchId, currentBranchId())),
        ),
      )
      .for("update");
    return row;
  }

  async create(data: UserInput, passwordHash: string) {
    const [result] = await this.db.insert(users).values({
      name: data.name,
      username: data.username,
      role: data.role,
      passwordHash,
    }).$returningId();
    return result.id;
  }

  async update(
    id: string,
    data: Omit<UserUpdateInput, "password"> & { passwordHash?: string },
  ) {
    await this.db
      .update(users)
      .set({
        ...data,
        ...(data.passwordHash
          ? { tokenVersion: sql`${users.tokenVersion} + 1` }
          : {}),
      })
      .where(eq(users.id, id));
  }
}
