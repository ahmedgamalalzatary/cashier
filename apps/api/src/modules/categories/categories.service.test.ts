import { describe, expect, it, vi } from 'vitest';
import type { CategoriesRepository } from './categories.repository.js';
import { CategoriesService } from './categories.service.js';

describe('CategoriesService lock ordering', () => {
  it('locks the complete update set through one ordered repository operation', async () => {
    const rows = new Map([
      [1, { id: 1, name: 'A', parentId: null, isActive: true }],
      [2, { id: 2, name: 'B', parentId: null, isActive: true }],
    ]);
    const repo = {
      transaction: vi.fn(
        async (run: (value: CategoriesRepository) => Promise<void>) =>
          run(repo as unknown as CategoriesRepository),
      ),
      lockForUpdate: vi.fn().mockResolvedValue([...rows.values()]),
      update: vi.fn().mockResolvedValue(true),
    };
    const service = new CategoriesService(
      repo as unknown as CategoriesRepository,
    );

    await service.update(2, { parentId: 1 });

    expect(repo.lockForUpdate).toHaveBeenCalledOnce();
    expect(repo.lockForUpdate).toHaveBeenCalledWith(2, 1);
  });

  it('locks deactivation and its complete subtree through the same ordered operation', async () => {
    const repo = {
      transaction: vi.fn(
        async (run: (value: CategoriesRepository) => Promise<void>) =>
          run(repo as unknown as CategoriesRepository),
      ),
      lockForUpdate: vi.fn().mockResolvedValue([
        { id: 1, name: 'Child', parentId: 2, isActive: true },
        { id: 2, name: 'Parent', parentId: null, isActive: true },
      ]),
      deactivateMany: vi.fn().mockResolvedValue(undefined),
    };
    const service = new CategoriesService(
      repo as unknown as CategoriesRepository,
    );

    await service.deactivate(2);

    expect(repo.lockForUpdate).toHaveBeenCalledOnce();
    expect(repo.lockForUpdate).toHaveBeenCalledWith(2);
    expect(repo.deactivateMany).toHaveBeenCalledWith([2, 1]);
  });
});
