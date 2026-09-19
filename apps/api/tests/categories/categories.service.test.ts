import { describe, expect, it, vi } from 'vitest';
import type { CategoriesRepository } from '../../src/modules/categories/categories.repository.js';
import { CategoriesService } from '../../src/modules/categories/categories.service.js';

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

function repoWithRows(
  rows: Array<{
    id: number;
    name: string;
    parentId: number | null;
    isActive: boolean;
  }>,
  overrides: Record<string, unknown> = {},
) {
  const repo = {
    transaction: vi.fn(
      async (run: (value: CategoriesRepository) => Promise<unknown>) =>
        run(repo as unknown as CategoriesRepository),
    ),
    findByIdForUpdate: vi.fn(async (id: number) =>
      rows.find((row) => row.id === id),
    ),
    lockForUpdate: vi.fn(async () => rows),
    hasActiveItems: vi.fn(async () => false),
    hasActiveRecipes: vi.fn(async () => false),
    create: vi.fn(async () => 9),
    update: vi.fn(async () => true),
    deactivateMany: vi.fn(async () => undefined),
    ...overrides,
  };
  return repo;
}

const mainRow = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  name: 'Main',
  parentId: null,
  isActive: true,
  ...overrides,
});

describe('CategoriesService parent validation', () => {
  it('400s a missing, inactive, or sub-level parent on create', async () => {
    const missing = repoWithRows([]);
    await expect(
      new CategoriesService(missing as unknown as CategoriesRepository).create({
        name: 'Sub',
        parentId: 99,
      }),
    ).rejects.toMatchObject({ status: 400 });

    const inactive = repoWithRows([mainRow({ isActive: false })]);
    await expect(
      new CategoriesService(inactive as unknown as CategoriesRepository).create({
        name: 'Sub',
        parentId: 1,
      }),
    ).rejects.toMatchObject({ status: 400 });

    const subParent = repoWithRows([
      mainRow(),
      { id: 2, name: 'Sub', parentId: 1, isActive: true },
    ]);
    await expect(
      new CategoriesService(
        subParent as unknown as CategoriesRepository,
      ).create({ name: 'SubSub', parentId: 2 }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('409s creating a branch under an item- or recipe-linked parent', async () => {
    for (const flag of ['hasActiveItems', 'hasActiveRecipes'] as const) {
      const repo = repoWithRows([mainRow()], { [flag]: vi.fn(async () => true) });
      await expect(
        new CategoriesService(repo as unknown as CategoriesRepository).create({
          name: 'Sub',
          parentId: 1,
        }),
      ).rejects.toMatchObject({ status: 409 });
    }
  });

  it('creates a main category without touching the parent checks', async () => {
    const repo = repoWithRows([]);
    const service = new CategoriesService(
      repo as unknown as CategoriesRepository,
    );

    await expect(service.create({ name: 'Main' })).resolves.toBe(9);
    expect(repo.findByIdForUpdate).not.toHaveBeenCalled();
  });
});

describe('CategoriesService update guards', () => {
  it('404s a missing category', async () => {
    const repo = repoWithRows([]);
    await expect(
      new CategoriesService(repo as unknown as CategoriesRepository).update(999, {
        name: 'x',
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('400s self-parenting and moving a parent that has children', async () => {
    const selfParent = repoWithRows([mainRow()]);
    await expect(
      new CategoriesService(
        selfParent as unknown as CategoriesRepository,
      ).update(1, { parentId: 1 }),
    ).rejects.toMatchObject({ status: 400 });

    const withChild = repoWithRows([
      mainRow({ id: 1 }),
      mainRow({ id: 2 }),
      { id: 3, name: 'Child', parentId: 2, isActive: true },
    ]);
    await expect(
      new CategoriesService(
        withChild as unknown as CategoriesRepository,
      ).update(2, { parentId: 1 }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('409s deactivation under active items or active recipes', async () => {
    for (const flag of ['hasActiveItems', 'hasActiveRecipes'] as const) {
      const repo = repoWithRows([mainRow()], {
        [flag]: vi.fn(async () => true),
      });
      await expect(
        new CategoriesService(repo as unknown as CategoriesRepository).deactivate(
          1,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(repo.deactivateMany).not.toHaveBeenCalled();
    }
  });
});
