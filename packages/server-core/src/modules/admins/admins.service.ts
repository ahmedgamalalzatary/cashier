import bcrypt from "bcryptjs";
import type { AuthUser } from "@cashier/shared";
import { HttpError } from "../../middleware/error.js";
import type { AdminsRepository } from "./admins.repository.js";
import type { AdminInput, AdminUpdateInput } from "./admins.schemas.js";

function duplicateUsername(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ER_DUP_ENTRY"
  );
}

const SUPER_ADMIN_ONLY = "إدارة المديرين متاحة للمدير الرئيسي فقط";
const SUPER_ADMIN_MANAGED = "بيانات المدير الرئيسي تُدار من إعدادات الخادم";
const CASHIER_MANAGED = "تُدار حسابات الكاشير وصلاحية الدخول من سجل الموظف";

/**
 * Admin accounts are owned by the online site (plan Phase 8.2). Unlike the shop
 * app's users module this one is never branch-scoped: an admin may be assigned
 * several branches, so there is no current branch to read the list from.
 */
export class AdminsService {
  constructor(private repo: AdminsRepository) {}

  private requireSuperAdmin(actor: AuthUser) {
    if (!actor.isSuperAdmin) throw new HttpError(403, SUPER_ADMIN_ONLY);
  }

  async list(actor: AuthUser) {
    this.requireSuperAdmin(actor);
    return this.repo.list();
  }

  async create(actor: AuthUser, data: AdminInput) {
    this.requireSuperAdmin(actor);
    try {
      const id = await this.repo.transaction(async (repo) => {
        const newId = await repo.create(
          data,
          await bcrypt.hash(data.password, 10),
        );
        await this.assertBranchesExist(repo, data.branchIds);
        await repo.replaceBranches(newId, data.branchIds);
        return newId;
      });
      return { id };
    } catch (error) {
      if (duplicateUsername(error))
        throw new HttpError(409, "اسم المستخدم مستخدم بالفعل");
      throw error;
    }
  }

  async update(actor: AuthUser, id: string, data: AdminUpdateInput) {
    this.requireSuperAdmin(actor);
    if (id === actor.id) throw new HttpError(409, SUPER_ADMIN_MANAGED);
    const passwordHash = data.password
      ? await bcrypt.hash(data.password, 10)
      : undefined;
    try {
      await this.repo.transaction(async (repo) => {
        const user = await repo.findByIdForUpdate(id);
        if (!user) throw new HttpError(404, "المستخدم غير موجود");
        if (user.isSuperAdmin) throw new HttpError(409, SUPER_ADMIN_MANAGED);
        if (user.role === "cashier") throw new HttpError(409, CASHIER_MANAGED);
        const { password: _password, branchIds, ...changes } = data;
        // Checked before any write, so a bad branch leaves the account as it was.
        if (branchIds) await this.assertBranchesExist(repo, branchIds);
        const columns = { ...changes, ...(passwordHash ? { passwordHash } : {}) };
        if (Object.keys(columns).length > 0) await repo.update(id, columns);
        if (branchIds) await repo.replaceBranches(id, branchIds);
      });
    } catch (error) {
      if (duplicateUsername(error))
        throw new HttpError(409, "اسم المستخدم مستخدم بالفعل");
      throw error;
    }
  }

  async assignBranches(actor: AuthUser, id: string, branchIds: string[]) {
    this.requireSuperAdmin(actor);
    await this.repo.transaction(async (repo) => {
      const user = await repo.findByIdForUpdate(id);
      if (!user) throw new HttpError(404, "المستخدم غير موجود");
      if (user.isSuperAdmin) throw new HttpError(409, SUPER_ADMIN_MANAGED);
      if (user.role === "cashier") throw new HttpError(409, CASHIER_MANAGED);
      await this.assertBranchesExist(repo, branchIds);
      await repo.replaceBranches(id, branchIds);
    });
  }

  private async assertBranchesExist(
    repo: AdminsRepository,
    branchIds: string[],
  ) {
    if (branchIds.length === 0) return;
    const known = new Set(await repo.existingBranchIds());
    if (branchIds.some((branchId) => !known.has(branchId)))
      throw new HttpError(404, "أحد الفروع غير موجود");
  }
}
