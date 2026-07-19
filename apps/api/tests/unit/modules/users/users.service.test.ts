import { describe, expect, it, vi } from 'vitest';
import type { UsersRepository } from '../../../../src/modules/users/users.repository.js';
import { UsersService } from '../../../../src/modules/users/users.service.js';

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
