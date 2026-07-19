import { describe, expect, it } from 'vitest';
import { paymentInput, supplierInput } from '../../../../src/modules/suppliers/suppliers.schemas.js';

describe('supplier financial input', () => {
  it.each(['2026-02-30', '2026-13-01', 'not-a-date'])(
    'rejects impossible payment date %s',
    (paidAt) => {
      expect(paymentInput.safeParse({ amount: 1, paidAt }).success).toBe(false);
    },
  );

  it('accepts a real leap-day payment date', () => {
    expect(
      paymentInput.safeParse({ amount: 1, paidAt: '2028-02-29' }).success,
    ).toBe(true);
  });

  it.each([0.001, 10_000_000_000, Number.POSITIVE_INFINITY])(
    'rejects invalid opening balance %s',
    (openingBalance) => {
      expect(
        supplierInput.safeParse({ name: 'Supplier', openingBalance }).success,
      ).toBe(false);
    },
  );

  it.each([0.001, 10_000_000_000, Number.POSITIVE_INFINITY])(
    'rejects invalid payment amount %s',
    (amount) => {
      expect(
        paymentInput.safeParse({ amount, paidAt: '2026-07-19' }).success,
      ).toBe(false);
    },
  );
});
