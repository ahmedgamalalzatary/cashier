import { describe, expect, it, vi } from 'vitest';
import type { CategoriesRepository } from '../../../../src/modules/categories/categories.repository.js';
import { CategoriesService } from '../../../../src/modules/categories/categories.service.js';

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
      hasActiveItems: vi.fn().mockResolvedValue(false),
      hasActiveRecipes: vi.fn().mockResolvedValue(false),
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
      hasActiveItems: vi.fn().mockResolvedValue(false),
      hasActiveRecipes: vi.fn().mockResolvedValue(false),
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

  it('checks active items only on the category being deactivated and its children', async () => {
    const repo = {
      transaction: vi.fn(
        async (run: (value: CategoriesRepository) => Promise<void>) =>
          run(repo as unknown as CategoriesRepository),
      ),
      lockForUpdate: vi.fn().mockResolvedValue([
        { id: 1, name: 'Parent', parentId: null, isActive: true },
        { id: 2, name: 'Category', parentId: 1, isActive: true },
        { id: 3, name: 'Child', parentId: 2, isActive: true },
      ]),
      hasActiveItems: vi.fn().mockResolvedValue(false),
      hasActiveRecipes: vi.fn().mockResolvedValue(false),
      deactivateMany: vi.fn().mockResolvedValue(undefined),
    };
    const service = new CategoriesService(
      repo as unknown as CategoriesRepository,
    );

    await service.deactivate(2);

    expect(repo.hasActiveItems).toHaveBeenCalledWith([2, 3]);
    expect(repo.deactivateMany).toHaveBeenCalledWith([2, 3]);
  });
});

describe('CategoriesService deadlock retries', () => {
  it('retries an update transaction once after a MySQL deadlock', async () => {
    const deadlock = Object.assign(new Error('deadlock'), {
      code: 'ER_LOCK_DEADLOCK',
    });
    const repo = {
      transaction: vi
        .fn()
        .mockRejectedValueOnce(deadlock)
        .mockImplementationOnce(
          async (run: (value: CategoriesRepository) => Promise<void>) =>
            run(repo as unknown as CategoriesRepository),
        ),
      lockForUpdate: vi
        .fn()
        .mockResolvedValue([
          { id: 1, name: 'Category', parentId: null, isActive: true },
        ]),
      update: vi.fn().mockResolvedValue(true),
    };
    const service = new CategoriesService(
      repo as unknown as CategoriesRepository,
    );

    await service.update(1, { name: 'Renamed' });

    expect(repo.transaction).toHaveBeenCalledTimes(2);
    expect(repo.update).toHaveBeenCalledWith(1, { name: 'Renamed' });
  });

  it('retries a deactivate transaction once after a MySQL deadlock', async () => {
    const deadlock = Object.assign(new Error('deadlock'), {
      code: 'ER_LOCK_DEADLOCK',
    });
    const repo = {
      transaction: vi
        .fn()
        .mockRejectedValueOnce(deadlock)
        .mockImplementationOnce(
          async (run: (value: CategoriesRepository) => Promise<void>) =>
            run(repo as unknown as CategoriesRepository),
        ),
      lockForUpdate: vi
        .fn()
        .mockResolvedValue([
          { id: 1, name: 'Category', parentId: null, isActive: true },
        ]),
      hasActiveItems: vi.fn().mockResolvedValue(false),
      hasActiveRecipes: vi.fn().mockResolvedValue(false),
      deactivateMany: vi.fn().mockResolvedValue(undefined),
    };
    const service = new CategoriesService(
      repo as unknown as CategoriesRepository,
    );

    await service.deactivate(1);

    expect(repo.transaction).toHaveBeenCalledTimes(2);
    expect(repo.deactivateMany).toHaveBeenCalledWith([1]);
  });

  it('does not retry a non-deadlock transaction failure', async () => {
    const failure = Object.assign(new Error('connection lost'), {
      code: 'PROTOCOL_CONNECTION_LOST',
    });
    const repo = {
      transaction: vi.fn().mockRejectedValue(failure),
    };
    const service = new CategoriesService(
      repo as unknown as CategoriesRepository,
    );

    await expect(service.deactivate(1)).rejects.toBe(failure);
    expect(repo.transaction).toHaveBeenCalledOnce();
  });
});
