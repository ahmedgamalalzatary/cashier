import { describe, expect, it } from 'vitest';
import { categoryUpdateInput } from '../../../../src/modules/categories/categories.schemas.js';

describe('category update schema', () => {
  it('allows reactivation but rejects deactivation through PUT', () => {
    expect(categoryUpdateInput.safeParse({ isActive: true }).success).toBe(true);
    expect(categoryUpdateInput.safeParse({ isActive: false }).success).toBe(false);
  });
});
