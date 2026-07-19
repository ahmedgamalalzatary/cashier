import { describe, expect, it, vi } from 'vitest';
import type { CategoriesRepository } from './categories.repository.js';
import { CategoriesService } from './categories.service.js';

describe('CategoriesService lock ordering', () => {
  it('locks the edited category and requested parent in ascending id order', async () => {
    const rows = new Map([
      [1, { id: 1, name: 'A', parentId: null, isActive: true }],
      [2, { id: 2, name: 'B', parentId: null, isActive: true }],
    ]);
    const repo = {
      transaction: vi.fn(async (run: (value: CategoriesRepository) => Promise<void>) => run(repo as unknown as CategoriesRepository)),
      findByIdForUpdate: vi.fn(async (id: number) => rows.get(id)),
      childrenForUpdate: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue(true),
    };
    const service = new CategoriesService(repo as unknown as CategoriesRepository);

    await service.update(2, { parentId: 1 });

    expect(repo.findByIdForUpdate.mock.calls.map(([id]) => id)).toEqual([1, 2]);
  });
});
