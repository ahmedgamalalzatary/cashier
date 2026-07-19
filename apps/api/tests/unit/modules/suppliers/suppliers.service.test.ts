import { describe, expect, it, vi } from 'vitest';
import type { SuppliersRepository } from '../../../../src/modules/suppliers/suppliers.repository.js';
import { SuppliersService } from '../../../../src/modules/suppliers/suppliers.service.js';

function repository(overrides: Record<string, unknown> = {}) {
  const repo = {
    transaction: vi.fn(
      async (run: (value: SuppliersRepository) => Promise<unknown>) =>
        run(repo as unknown as SuppliersRepository),
    ),
    findByIdForUpdate: vi.fn().mockResolvedValue({
      id: 1,
      openingBalance: '200.00',
      balance: '0.00',
      isActive: true,
    }),
    hasPayments: vi.fn().mockResolvedValue(false),
    hasPurchases: vi.fn().mockResolvedValue(false),
    update: vi.fn().mockResolvedValue(true),
    createPayment: vi.fn().mockResolvedValue(9),
    deactivate: vi.fn().mockResolvedValue(true),
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
      service.update(1, { openingBalance: 201 }),
    ).rejects.toMatchObject({ status: 409 });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('allows an unchanged opening balance after the first payment', async () => {
    const repo = repository({ hasPayments: vi.fn().mockResolvedValue(true) });
    const service = new SuppliersService(
      repo as unknown as SuppliersRepository,
    );

    await expect(
      service.update(1, { name: 'Renamed', openingBalance: 200 }),
    ).resolves.toBeUndefined();
    expect(repo.update).toHaveBeenCalledWith(1, {
      name: 'Renamed',
      openingBalance: 200,
    });
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

  it('rejects payments for an inactive supplier', async () => {
    const repo = repository({
      findByIdForUpdate: vi.fn().mockResolvedValue({
        id: 1,
        openingBalance: '0.00',
        balance: '0.00',
        isActive: false,
      }),
    });
    const service = new SuppliersService(
      repo as unknown as SuppliersRepository,
    );

    await expect(
      service.addPayment(1, { amount: 25, paidAt: '2026-07-19' }),
    ).rejects.toMatchObject({ status: 409 });
    expect(repo.createPayment).not.toHaveBeenCalled();
  });

  it.each(['1.00', '-1.00'])(
    'rejects deactivation while the supplier balance is %s',
    async (balance) => {
      const repo = repository({
        findByIdForUpdate: vi.fn().mockResolvedValue({
          id: 1,
          openingBalance: '0.00',
          balance,
          isActive: true,
        }),
      });
      const service = new SuppliersService(
        repo as unknown as SuppliersRepository,
      );

      await expect(service.deactivate(1)).rejects.toMatchObject({
        status: 409,
      });
      expect(repo.deactivate).not.toHaveBeenCalled();
    },
  );

  it('treats deactivating an already-inactive supplier as successful', async () => {
    const repo = repository({
      findByIdForUpdate: vi.fn().mockResolvedValue({
        id: 1,
        openingBalance: '0.00',
        balance: '0.00',
        isActive: false,
      }),
    });
    const service = new SuppliersService(
      repo as unknown as SuppliersRepository,
    );

    await expect(service.deactivate(1)).resolves.toBeUndefined();
    expect(repo.transaction).toHaveBeenCalledOnce();
    expect(repo.deactivate).not.toHaveBeenCalled();
  });
});
