import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@cashier/db";
import { adminBranches, branches, users } from "@cashier/db";
import type { AdminInput, AdminUpdateInput } from "./admins.schemas.js";

const safeUserColumns = {
  id: users.id,
  name: users.name,
  username: users.username,
  role: users.role,
  isActive: users.isActive,
  isSuperAdmin: users.isSuperAdmin,
  createdAt: users.createdAt,
};

export class AdminsRepository {
  constructor(private db: Db) {}

  transaction<T>(fn: (repo: AdminsRepository) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) =>
      fn(new AdminsRepository(tx as unknown as Db)),
    );
  }

  /** Every admin account, each with the branches it may read. */
  async list() {
    const rows = await this.db
      .select(safeUserColumns)
      .from(users)
      .where(eq(users.role, "admin"))
      .orderBy(asc(users.name));
    const assignments = rows.length
      ? await this.branchIdsFor(rows.map((row) => row.id))
      : new Map<string, string[]>();
    return rows.map(({ ...row }) => ({
      ...row,
      branchIds: assignments.get(row.id) ?? [],
    }));
  }

  async branchIdsFor(adminIds: string[]) {
    const rows = await this.db
      .select({
        adminUserId: adminBranches.adminUserId,
        branchId: adminBranches.branchId,
      })
      .from(adminBranches)
      .where(inArray(adminBranches.adminUserId, adminIds));
    const grouped = new Map<string, string[]>();
    for (const row of rows) {
      const ids = grouped.get(row.adminUserId) ?? [];
      ids.push(row.branchId);
      grouped.set(row.adminUserId, ids);
    }
    return grouped;
  }

  async findByIdForUpdate(id: string) {
    const [row] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, id), eq(users.role, "admin")))
      .for("update");
    return row;
  }

  async create(data: AdminInput, passwordHash: string) {
    const [result] = await this.db
      .insert(users)
      .values({
        name: data.name,
        username: data.username,
        role: "admin",
        passwordHash,
      })
      .$returningId();
    return result.id;
  }

  async update(
    id: string,
    data: Omit<AdminUpdateInput, "password"> & { passwordHash?: string },
  ) {
    await this.db
      .update(users)
      .set({
        ...data,
        // A password or an activation change must invalidate live sessions.
        ...(data.passwordHash || data.isActive === false
          ? { tokenVersion: sql`${users.tokenVersion} + 1` }
          : {}),
      })
      .where(eq(users.id, id));
  }

  async replaceBranches(adminUserId: string, branchIds: string[]) {
    await this.db
      .delete(adminBranches)
      .where(eq(adminBranches.adminUserId, adminUserId));
    if (branchIds.length === 0) return;
    await this.db
      .insert(adminBranches)
      .values(branchIds.map((branchId) => ({ adminUserId, branchId })));
  }

  async existingBranchIds() {
    const rows = await this.db
      .select({ id: branches.id })
      .from(branches)
      .where(eq(branches.isActive, true));
    return rows.map((row) => row.id);
  }
}
