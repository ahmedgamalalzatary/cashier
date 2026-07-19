import { HttpError } from '../../middleware/error.js';
import type { CategoriesRepository } from './categories.repository.js';
import type {
  CategoryInput,
  CategoryUpdateInput,
} from './categories.schemas.js';

export class CategoriesService {
  constructor(private repo: CategoriesRepository) {}

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
      if (data.parentId != null)
        await this.assertValidParent(repo, data.parentId);
      return repo.create(data);
    });
  }

  update(id: number, data: CategoryUpdateInput) {
    return this.repo.transaction(async (repo) => {
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
      }
      await repo.update(id, data);
    });
  }

  // soft delete; a main category takes its sub-categories with it
  deactivate(id: number) {
    return this.repo.transaction(async (repo) => {
      const lockedRows = await repo.lockForUpdate(id);
      const category = lockedRows.find((row) => row.id === id);
      if (!category) throw new HttpError(404, 'التصنيف غير موجود');
      const children = lockedRows.filter((row) => row.parentId === id);
      await repo.deactivateMany([id, ...children.map((c) => c.id)]);
    });
  }
}
