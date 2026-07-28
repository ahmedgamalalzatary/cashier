import { HttpError } from "../../middleware/error.js";
import type { CategoriesRepository } from "./categories.repository.js";
import type {
  CategoryInput,
  CategoryUpdateInput,
} from "./categories.schemas.js";

export class CategoriesService {
  constructor(private repo: CategoriesRepository) {}

  private async transactionWithDeadlockRetry<T>(
    fn: (repo: CategoriesRepository) => Promise<T>,
  ) {
    try {
      return await this.repo.transaction(fn);
    } catch (error) {
      if (
        typeof error !== "object" ||
        error === null ||
        !("code" in error) ||
        error.code !== "ER_LOCK_DEADLOCK"
      )
        throw error;
      return this.repo.transaction(fn);
    }
  }

  list() {
    return this.repo.list();
  }

  private validateParent(
    parent:
      | Awaited<ReturnType<CategoriesRepository["findByIdForUpdate"]>>
      | undefined,
  ) {
    if (!parent) throw new HttpError(400, "التصنيف الرئيسي غير موجود");
    if (!parent.isActive) throw new HttpError(400, "التصنيف الرئيسي موقوف");
    if (parent.parentId !== null)
      throw new HttpError(400, "مستويان فقط: لا يمكن إضافة فرعي تحت تصنيف فرعي");
  }

  create(data: CategoryInput) {
    return this.repo.transaction(async (repo) => {
      if (data.parentId != null) {
        this.validateParent(await repo.findByIdForUpdate(data.parentId));
        if (await repo.hasActiveItems([data.parentId]))
          throw new HttpError(
            409,
            "لا يمكن إضافة فرع تحت تصنيف مرتبط بمنتجات مباشرة",
          );
      }
      const id = await repo.create({
        name: data.name,
        parentId: data.parentId,
      });
      await repo.replaceOptions(id, data.colors, data.sizes);
      return id;
    });
  }

  update(id: number, data: CategoryUpdateInput) {
    return this.transactionWithDeadlockRetry(async (repo) => {
      const lockedRows = await repo.lockForUpdate(id, data.parentId ?? undefined);
      const locked = new Map(lockedRows.map((row) => [row.id, row]));
      const category = locked.get(id);
      if (!category) throw new HttpError(404, "التصنيف غير موجود");
      if (data.parentId != null) {
        if (data.parentId === id)
          throw new HttpError(400, "لا يمكن جعل التصنيف تابعاً لنفسه");
        if (lockedRows.some((row) => row.parentId === id))
          throw new HttpError(
            400,
            "لا يمكن نقل تصنيف رئيسي له فروع تحت تصنيف آخر",
          );
        this.validateParent(locked.get(data.parentId));
        if (await repo.hasActiveItems([data.parentId]))
          throw new HttpError(
            409,
            "لا يمكن إضافة فرع تحت تصنيف مرتبط بمنتجات مباشرة",
          );
      }
      if (
        data.isActive === true &&
        data.parentId === undefined &&
        category.parentId !== null
      )
        this.validateParent(locked.get(category.parentId));
      const { colors, sizes, ...categoryData } = data;
      if (Object.keys(categoryData).length) await repo.update(id, categoryData);
      if (colors !== undefined || sizes !== undefined)
        await repo.replaceOptions(id, colors, sizes);
    });
  }

  deactivate(id: number) {
    return this.transactionWithDeadlockRetry(async (repo) => {
      const lockedRows = await repo.lockForUpdate(id);
      const category = lockedRows.find((row) => row.id === id);
      if (!category) throw new HttpError(404, "التصنيف غير موجود");
      const children = lockedRows.filter((row) => row.parentId === id);
      const categoryIds = [id, ...children.map((row) => row.id)];
      if (await repo.hasActiveItems(categoryIds))
        throw new HttpError(409, "لا يمكن إيقاف تصنيف مرتبط بمنتجات نشطة");
      await repo.deactivateMany(categoryIds);
    });
  }
}
