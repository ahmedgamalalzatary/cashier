import bcrypt from "bcryptjs";
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

export class UsersService {
  constructor(private repo: UsersRepository) {}

  list() {
    return this.repo.list();
  }

  async create(data: UserInput) {
    try {
      return await this.repo.create(data, await bcrypt.hash(data.password, 10));
    } catch (error) {
      if (duplicateUsername(error))
        throw new HttpError(409, "اسم المستخدم مستخدم بالفعل");
      throw error;
    }
  }

  async update(actorId: number, id: number, data: UserUpdateInput) {
    if (id === actorId && data.password) {
      throw new HttpError(
        409,
        "غيّر كلمة مرور حسابك من خيار تغيير كلمة المرور",
      );
    }
    const passwordHash = data.password
      ? await bcrypt.hash(data.password, 10)
      : undefined;
    try {
      await this.repo.transaction(async (repo) => {
        const user = await repo.findByIdForUpdate(id);
        if (!user) throw new HttpError(404, "المستخدم غير موجود");
        if (
          id === actorId &&
          (data.isActive === false ||
            (data.role !== undefined && data.role !== "admin"))
        ) {
          throw new HttpError(
            409,
            "لا يمكنك إيقاف حسابك أو إزالة صلاحية المدير منه",
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
