import type { AuthUser } from "@cashier/shared";
import { HttpError } from "../../middleware/error.js";
import type { BranchesRepository } from "./branches.repository.js";
import type { BranchInput, BranchUpdateInput } from "./branches.schemas.js";

export class BranchesService {
  constructor(private repo: BranchesRepository) {}
  list(actor: AuthUser) {
    return this.repo.list(
      actor.role === "cashier" ? (actor.branchId ?? 1) : undefined,
    );
  }
  async create(input: BranchInput) {
    try {
      return await this.repo.transaction(async (repo) => {
        const id = await repo.create(input);
        await repo.copyCatalog(id);
        return repo.get(id);
      });
    } catch (error) {
      this.rethrow(error);
    }
  }
  async update(id: number, input: BranchUpdateInput) {
    try {
      await this.repo.transaction(async (repo) => {
        const rows = await repo.lockAll();
        const branch = rows.find((row) => row.id === id);
        if (!branch) throw new HttpError(404, "الفرع غير موجود");
        if (input.isActive === false && branch.isActive) {
          if (rows.filter((row) => row.isActive).length === 1) {
            throw new HttpError(409, "يجب الإبقاء على فرع نشط واحد على الأقل");
          }
          if (await repo.hasOpenShift(id))
            throw new HttpError(409, "أغلق ورديات الفرع قبل أرشفته");
        }
        await repo.update(id, input);
      });
      return this.repo.get(id);
    } catch (error) {
      this.rethrow(error);
    }
  }
  private rethrow(error: unknown): never {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ER_DUP_ENTRY"
    ) {
      throw new HttpError(409, "اسم الفرع مستخدم بالفعل");
    }
    throw error;
  }
}
