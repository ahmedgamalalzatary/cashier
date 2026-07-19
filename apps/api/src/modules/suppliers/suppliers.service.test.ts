import { describe, expect, it, vi } from 'vitest';
import type { SuppliersRepository } from './suppliers.repository.js';
import { SuppliersService } from './suppliers.service.js';

function repository(overrides: Record<string, unknown> = {}) {
  const repo = {
    transaction: vi.fn(
      async (run: (value: SuppliersRepository) => Promise<unknown>) =>
        run(repo as unknown as SuppliersRepository),
    ),
    findByIdForUpdate: vi.fn().mockResolvedValue({ id: 1, isActive: true }),
    hasPayments: vi.fn().mockResolvedValue(false),
    update: vi.fn().mockResolvedValue(true),
    createPayment: vi.fn().mockResolvedValue(9),
    ...overrides,
  };
  return repo;
}

describe('SuppliersService financial consistency', () => {
  it('rejects an opening-balance rewrite after the first payment', async () => {
    const repo = repository({ hasPayments: vi.fn().mockResolvedValue(true) });
    const service = new SuppliersService(
      repo as unknown as SuppliersRepository,
    );

    await expect(
      service.update(1, { openingBalance: 200 }),
    ).rejects.toMatchObject({ status: 409 });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('validates and creates a payment within one repository transaction', async () => {
    const repo = repository();
    const service = new SuppliersService(
      repo as unknown as SuppliersRepository,
    );

    await expect(
      service.addPayment(1, { amount: 25, paidAt: '2026-07-19' }),
    ).resolves.toBe(9);
    expect(repo.transaction).toHaveBeenCalledOnce();
    expect(repo.findByIdForUpdate).toHaveBeenCalledWith(1);
    expect(repo.createPayment).toHaveBeenCalledWith(1, {
      amount: 25,
      paidAt: '2026-07-19',
    });
  });
});
