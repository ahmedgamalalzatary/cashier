import { describe, expect, it, vi } from 'vitest';
import type { SuppliersRepository } from '../../src/modules/suppliers/suppliers.repository.js';
import { SuppliersService } from '../../src/modules/suppliers/suppliers.service.js';

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

  it('404s missing suppliers on update, deactivate, payment, and statement', async () => {
    const missingTx = repository({
      findByIdForUpdate: vi.fn().mockResolvedValue(undefined),
    });
    const missingService = new SuppliersService(
      missingTx as unknown as SuppliersRepository,
    );
    await expect(missingService.update(999, { name: 'x' })).rejects.toMatchObject({
      status: 404,
    });
    await expect(missingService.deactivate(999)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      missingService.addPayment(999, { amount: 25, paidAt: '2026-07-19' }),
    ).rejects.toMatchObject({ status: 404 });

    const missingGet = { findById: vi.fn().mockResolvedValue(undefined) };
    await expect(
      new SuppliersService(
        missingGet as unknown as SuppliersRepository,
      ).statement(999),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('blocks an opening-balance rewrite after purchases even without payments', async () => {
    const repo = repository({
      hasPayments: vi.fn().mockResolvedValue(false),
      hasPurchases: vi.fn().mockResolvedValue(true),
    });
    const service = new SuppliersService(
      repo as unknown as SuppliersRepository,
    );

    await expect(
      service.update(1, { openingBalance: 201 }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe('SuppliersService statement math', () => {
  const supplier = {
    id: 1,
    name: 'المورد',
    openingBalance: '100.00',
  };

  function statementRepo(purchases: unknown[], payments: unknown[]) {
    return {
      findById: vi.fn(async () => supplier),
      listPayments: vi.fn(async () => payments),
      listPurchases: vi.fn(async () => purchases),
    } as unknown as SuppliersRepository;
  }

  it('orders same-day purchases before payments and keeps a running balance', async () => {
    const repo = statementRepo(
      [
        { id: 2, purchasedAt: '2026-07-20', invoiceNumber: null, totalAmount: '50.00' },
        { id: 1, purchasedAt: '2026-07-19', invoiceNumber: 'INV-1', totalAmount: '30.00' },
      ],
      [{ id: 5, paidAt: '2026-07-20', amount: '20.00', notes: null }],
    );

    const { movements } = await new SuppliersService(repo).statement(1);

    expect(movements.map((movement) => movement.id)).toEqual([
      'purchase-1',
      'purchase-2',
      'payment-5',
    ]);
    expect(movements.map((movement) => movement.balanceAfter)).toEqual([
      '130.00',
      '180.00',
      '160.00',
    ]);
    expect(movements[1]).toMatchObject({
      description: 'فاتورة شراء #2',
      amount: '50.00',
    });
    expect(movements[2]).toMatchObject({
      description: 'دفعة للمورد',
      amount: '-20.00',
    });
  });

  it('formats negative running balances and custom descriptions', async () => {
    const repo = statementRepo(
      [],
      [{ id: 5, paidAt: '2026-07-20', amount: '150.00', notes: 'عربون' }],
    );

    const { movements } = await new SuppliersService(repo).statement(1);

    expect(movements).toEqual([
      expect.objectContaining({
        id: 'payment-5',
        description: 'عربون',
        amount: '-150.00',
        balanceAfter: '-50.00',
      }),
    ]);
  });
});
