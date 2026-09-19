import { describe, expect, it, vi } from 'vitest';
import type { UsersRepository } from '../../src/modules/users/users.repository.js';
import { UsersService } from '../../src/modules/users/users.service.js';

describe('UsersService self-management', () => {
  it('requires the dedicated password flow when an admin edits their own account', async () => {
    const repo = {
      transaction: vi.fn(),
    };
    const service = new UsersService(repo as unknown as UsersRepository);

    await expect(
      service.update(7, 7, { password: 'replacement-789' }),
    ).rejects.toMatchObject({ status: 409 });
    expect(repo.transaction).not.toHaveBeenCalled();
  });
});

function repoForUpdate(
  user: { id: number; role: string } | undefined,
  overrides: Record<string, unknown> = {},
) {
  const tx = {
    findByIdForUpdate: vi.fn(async () => user),
    update: vi.fn(async () => undefined),
    ...overrides,
  };
  return {
    transaction: vi.fn(async (run: (repo: unknown) => Promise<unknown>) =>
      run(tx),
    ),
    tx,
  } as unknown as UsersRepository & {
    tx: { update: { mock: { calls: unknown[][] } } };
  };
}

describe('UsersService update guards', () => {
  it('404s a missing user', async () => {
    const repo = repoForUpdate(undefined);

    await expect(
      new UsersService(repo).update(7, 999, { name: 'x' }),
    ).rejects.toMatchObject({
      status: 404,
    });
  });

  it('409s cashier-managed accounts in either direction', async () => {
    await expect(
      new UsersService(repoForUpdate({ id: 2, role: 'cashier' })).update(7, 2, {
        name: 'x',
      }),
    ).rejects.toMatchObject({ status: 409 });

    await expect(
      new UsersService(repoForUpdate({ id: 2, role: 'admin' })).update(7, 2, {
        role: 'cashier',
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('409s self-deactivation and self-demotion', async () => {
    for (const data of [{ isActive: false }, { role: 'cashier' }] as const) {
      await expect(
        new UsersService(repoForUpdate({ id: 7, role: 'admin' })).update(
          7,
          7,
          data,
        ),
      ).rejects.toMatchObject({ status: 409 });
    }
  });

  it('maps a duplicate username on update to 409', async () => {
    const duplicate = Object.assign(new Error('duplicate'), {
      code: 'ER_DUP_ENTRY',
    });
    const repo = repoForUpdate(
      { id: 2, role: 'admin' },
      {
        update: vi.fn(async () => {
          throw duplicate;
        }),
      },
    );

    await expect(
      new UsersService(repo).update(7, 2, { username: 'taken' }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('stores a password hash instead of the plain password', async () => {
    const repo = repoForUpdate({ id: 2, role: 'admin' });

    await new UsersService(repo).update(7, 2, { password: 'replacement-789' });

    expect(repo.tx.update).toHaveBeenCalledTimes(1);
    const changes = (
      repo.tx.update as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls[0][1] as Record<string, unknown>;
    expect(typeof changes.passwordHash).toBe('string');
    expect(changes.passwordHash).not.toBe('replacement-789');
    expect(changes).not.toHaveProperty('password');
  });
});

describe('UsersService create', () => {
  it('maps a duplicate username to 409', async () => {
    const duplicate = Object.assign(new Error('duplicate'), {
      code: 'ER_DUP_ENTRY',
    });
    const repo = {
      create: vi.fn(async () => { throw duplicate; }),
    } as unknown as UsersRepository;

    await expect(
      new UsersService(repo).create({
        name: 'مدير',
        username: 'taken',
        role: 'admin',
        password: 'password-123',
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});
