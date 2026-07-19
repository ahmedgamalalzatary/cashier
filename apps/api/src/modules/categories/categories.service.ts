import { HttpError } from '../../middleware/error.js';
import type { CategoriesRepository } from './categories.repository.js';
import type { CategoryInput, CategoryUpdateInput } from './categories.schemas.js';

export class CategoriesService {
  constructor(private repo: CategoriesRepository) {}

  list() {
    return this.repo.list();
  }

  // locks the parent row so it can't be deactivated/re-parented mid-operation
  private async assertValidParent(repo: CategoriesRepository, parentId: number) {
    const parent = await repo.findByIdForUpdate(parentId);
    if (!parent) throw new HttpError(400, 'التصنيف الرئيسي غير موجود');
    if (!parent.isActive) throw new HttpError(400, 'التصنيف الرئيسي موقوف');
    if (parent.parentId !== null)
      throw new HttpError(400, 'مستويان فقط: لا يمكن إضافة فرعي تحت تصنيف فرعي');
    return parent;
  }

  create(data: CategoryInput) {
    return this.repo.transaction(async (repo) => {
      if (data.parentId != null) await this.assertValidParent(repo, data.parentId);
      return repo.create(data);
    });
  }

  update(id: number, data: CategoryUpdateInput) {
    return this.repo.transaction(async (repo) => {
      const category = await repo.findByIdForUpdate(id);
      if (!category) throw new HttpError(404, 'التصنيف غير موجود');
      if (data.parentId !== undefined && data.parentId !== null) {
        if (data.parentId === id) throw new HttpError(400, 'لا يمكن جعل التصنيف تابعاً لنفسه');
        const children = await repo.childrenForUpdate(id);
        if (children.length > 0)
          throw new HttpError(400, 'لا يمكن نقل تصنيف رئيسي له فروع تحت تصنيف آخر');
        await this.assertValidParent(repo, data.parentId);
      }
      await repo.update(id, data);
    });
  }

  // soft delete; a main category takes its sub-categories with it
  deactivate(id: number) {
    return this.repo.transaction(async (repo) => {
      const category = await repo.findByIdForUpdate(id);
      if (!category) throw new HttpError(404, 'التصنيف غير موجود');
      const children = await repo.childrenForUpdate(id);
      await repo.deactivateMany([id, ...children.map((c) => c.id)]);
    });
  }
}
