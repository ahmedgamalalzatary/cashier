import bcrypt from "bcryptjs";
import type { AuthUser } from "@cashier/shared";
import { HttpError } from "../../middleware/error.js";
import type { UsersRepository } from "./users.repository.js";
import type { UserInput, UserUpdateInput } from "./users.schemas.js";

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

export class UsersService {
  constructor(private repo: UsersRepository) {}

  list() {
    return this.repo.list();
  }

  async create(actor: AuthUser, data: UserInput) {
    if (!actor.isSuperAdmin) throw new HttpError(403, SUPER_ADMIN_ONLY);
    try {
      return await this.repo.create(data, await bcrypt.hash(data.password, 10));
    } catch (error) {
      if (duplicateUsername(error))
        throw new HttpError(409, "اسم المستخدم مستخدم بالفعل");
      throw error;
    }
  }

  async update(actor: AuthUser, id: number, data: UserUpdateInput) {
    if (!actor.isSuperAdmin) throw new HttpError(403, SUPER_ADMIN_ONLY);
    if (id === actor.id) throw new HttpError(409, SUPER_ADMIN_MANAGED);
    const passwordHash = data.password
      ? await bcrypt.hash(data.password, 10)
      : undefined;
    try {
      await this.repo.transaction(async (repo) => {
        const user = await repo.findByIdForUpdate(id);
        if (!user) throw new HttpError(404, "المستخدم غير موجود");
        if (user.isSuperAdmin) throw new HttpError(409, SUPER_ADMIN_MANAGED);
        if (user.role === "cashier" || data.role === "cashier") {
          throw new HttpError(
            409,
            "تُدار حسابات الكاشير وصلاحية الدخول من سجل الموظف",
          );
        }
        const { password: _password, ...changes } = data;
        await repo.update(id, {
          ...changes,
          ...(passwordHash ? { passwordHash } : {}),
        });
      });
    } catch (error) {
      if (duplicateUsername(error))
        throw new HttpError(409, "اسم المستخدم مستخدم بالفعل");
      throw error;
    }
  }
}
