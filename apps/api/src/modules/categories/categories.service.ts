import { HttpError } from '../../middleware/error.js';
import type { CategoriesRepository } from './categories.repository.js';
import type {
  CategoryInput,
  CategoryUpdateInput,
} from './categories.schemas.js';

export class CategoriesService {
  constructor(private repo: CategoriesRepository) {}

  private async transactionWithDeadlockRetry<T>(
    fn: (repo: CategoriesRepository) => Promise<T>,
  ) {
    try {
      return await this.repo.transaction(fn);
    } catch (error) {
      if (
        typeof error !== 'object' ||
        error === null ||
        !('code' in error) ||
        error.code !== 'ER_LOCK_DEADLOCK'
      ) {
        throw error;
      }
      return this.repo.transaction(fn);
    }
  }

  list() {
    return this.repo.list();
  }

  // locks the parent row so it can't be deactivated/re-parented mid-operation
  private validateParent(
    parent:
      | Awaited<ReturnType<CategoriesRepository['findByIdForUpdate']>>
      | undefined,
  ) {
    if (!parent) throw new HttpError(400, 'التصنيف الرئيسي غير موجود');
    if (!parent.isActive) throw new HttpError(400, 'التصنيف الرئيسي موقوف');
    if (parent.parentId !== null)
      throw new HttpError(
        400,
        'مستويان فقط: لا يمكن إضافة فرعي تحت تصنيف فرعي',
      );
    return parent;
  }

  private async assertValidParent(
    repo: CategoriesRepository,
    parentId: number,
  ) {
    return this.validateParent(await repo.findByIdForUpdate(parentId));
  }

  create(data: CategoryInput) {
    return this.repo.transaction(async (repo) => {
      if (data.parentId != null) {
        await this.assertValidParent(repo, data.parentId);
        if (await repo.hasActiveItems([data.parentId])) {
          throw new HttpError(
            409,
            'لا يمكن إضافة فرع تحت تصنيف مرتبط بأصناف مباشرة',
          );
        }
      }
      return repo.create(data);
    });
  }

  update(id: number, data: CategoryUpdateInput) {
    return this.transactionWithDeadlockRetry(async (repo) => {
      const requestedParentId = data.parentId;
      const lockedRows = await repo.lockForUpdate(
        id,
        requestedParentId ?? undefined,
      );
      const locked = new Map(lockedRows.map((row) => [row.id, row]));

      const category = locked.get(id);
      if (!category) throw new HttpError(404, 'التصنيف غير موجود');
      if (requestedParentId != null) {
        if (requestedParentId === id)
          throw new HttpError(400, 'لا يمكن جعل التصنيف تابعاً لنفسه');
        const children = lockedRows.filter((row) => row.parentId === id);
        if (children.length > 0)
          throw new HttpError(
            400,
            'لا يمكن نقل تصنيف رئيسي له فروع تحت تصنيف آخر',
          );
        this.validateParent(locked.get(requestedParentId));
        if (await repo.hasActiveItems([requestedParentId])) {
          throw new HttpError(
            409,
            'لا يمكن إضافة فرع تحت تصنيف مرتبط بأصناف مباشرة',
          );
        }
      }
      if (
        data.isActive === true &&
        requestedParentId === undefined &&
        category.parentId !== null
      ) {
        this.validateParent(locked.get(category.parentId));
      }
      await repo.update(id, data);
    });
  }

  // soft delete; a main category takes its sub-categories with it
  deactivate(id: number) {
    return this.transactionWithDeadlockRetry(async (repo) => {
      const lockedRows = await repo.lockForUpdate(id);
      const category = lockedRows.find((row) => row.id === id);
      if (!category) throw new HttpError(404, 'التصنيف غير موجود');
      const children = lockedRows.filter((row) => row.parentId === id);
      const categoryIds = [id, ...children.map((row) => row.id)];
      if (await repo.hasActiveItems(categoryIds)) {
        throw new HttpError(409, 'لا يمكن إيقاف تصنيف مرتبط بأصناف نشطة');
      }
      await repo.deactivateMany(categoryIds);
    });
  }
}
