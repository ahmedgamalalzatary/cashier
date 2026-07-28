import { describe, expect, it } from 'vitest';
import {
  categoryInput,
  categoryUpdateInput,
} from '../../../../src/modules/categories/categories.schemas.js';

describe('category input schema', () => {
  it('requires at least one unique color and size', () => {
    expect(
      categoryInput.safeParse({
        name: 'تي شيرت',
        colors: ['أسود', 'أبيض'],
        sizes: ['M', 'L'],
      }).success,
    ).toBe(true);
    expect(
      categoryInput.safeParse({
        name: 'تي شيرت',
        colors: [],
        sizes: ['M'],
      }).success,
    ).toBe(false);
    expect(
      categoryInput.safeParse({
        name: 'تي شيرت',
        colors: [' أسود ', 'أسود'],
        sizes: ['M'],
      }).success,
    ).toBe(false);
  });
});

describe('category update schema', () => {
  it('allows reactivation but rejects deactivation through PUT', () => {
    expect(categoryUpdateInput.safeParse({ isActive: true }).success).toBe(true);
    expect(categoryUpdateInput.safeParse({ isActive: false }).success).toBe(false);
  });
});
