import { and, eq, getTableColumns } from "drizzle-orm";
import type { Db } from "@cashier/db";
import { adminBranches, branches, users } from "@cashier/db";
import type { Role } from "@cashier/shared";

export class AuthRepository {
  constructor(private db: Db) {}

  async findByUsername(username: string, role: Role, branchId?: string) {
    const rows = await this.db
      .select({ ...getTableColumns(users), branchIsActive: branches.isActive })
      .from(users)
      .leftJoin(branches, eq(users.branchId, branches.id))
      .where(
        and(
          eq(users.username, username),
          eq(users.role, role),
          role === "cashier" && branchId
            ? eq(users.branchId, branchId)
            : undefined,
        ),
      )
      .limit(2);
    // An unpinned development API must never pick one of two same-name cashiers.
    return rows.length === 1 ? rows[0] : undefined;
  }

  async isAdminAssigned(adminUserId: string, branchId: string) {
    const [row] = await this.db
      .select()
      .from(adminBranches)
      .where(
        and(
          eq(adminBranches.adminUserId, adminUserId),
          eq(adminBranches.branchId, branchId),
        ),
      )
      .limit(1);
    return Boolean(row);
  }
}
