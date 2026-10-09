import { and, eq, exists, or } from "drizzle-orm";
import { adminBranches, branches, users, type Db } from "@cashier/db";
import { HttpError } from "../../middleware/error.js";

/** A consistent snapshot of only the accounts this device's branch needs. */
export function readDeviceAccounts(db: Db, branchId: string) {
  return db.transaction(async (tx) => {
    const [branch] = await tx
      .select({
        id: branches.id,
        name: branches.name,
        isActive: branches.isActive,
        createdAt: branches.createdAt,
      })
      .from(branches)
      .where(eq(branches.id, branchId));
    if (!branch) throw new HttpError(401, "هذا الجهاز غير مربوط بفرع");
    const assigned = tx
      .select({ id: adminBranches.adminUserId })
      .from(adminBranches)
      .where(
        and(
          eq(adminBranches.branchId, branchId),
          eq(adminBranches.adminUserId, users.id),
        ),
      );
    const accounts = await tx
      .select({
        id: users.id,
        name: users.name,
        username: users.username,
        passwordHash: users.passwordHash,
        role: users.role,
        isSuperAdmin: users.isSuperAdmin,
        isActive: users.isActive,
        tokenVersion: users.tokenVersion,
      })
      .from(users)
      .where(
        and(
          eq(users.role, "admin"),
          or(eq(users.isSuperAdmin, true), exists(assigned)),
        ),
      );
    const assignments = await tx
      .select({
        adminUserId: adminBranches.adminUserId,
        branchId: adminBranches.branchId,
      })
      .from(adminBranches)
      .innerJoin(users, eq(users.id, adminBranches.adminUserId))
      .where(
        and(eq(adminBranches.branchId, branchId), eq(users.role, "admin")),
      );
    return { branch, users: accounts, adminBranches: assignments };
  });
}
