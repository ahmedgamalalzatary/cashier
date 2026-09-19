import { describe, expect, it } from 'vitest';
import {
  categoryInput,
  categoryUpdateInput,
} from '../../src/modules/categories/categories.schemas.js';

describe('category update schema', () => {
  it('allows reactivation but rejects deactivation through PUT', () => {
    expect(categoryUpdateInput.safeParse({ isActive: true }).success).toBe(true);
    expect(categoryUpdateInput.safeParse({ isActive: false }).success).toBe(false);
  });
});

describe('category input schema', () => {
  it('trims names and enforces limits', () => {
    expect(categoryInput.parse({ name: '  خامات  ' }).name).toBe('خامات');
    expect(categoryInput.safeParse({ name: '   ' }).success).toBe(false);
    expect(categoryInput.safeParse({ name: 'x'.repeat(192) }).success).toBe(
      false,
    );
  });

  it('coerces parent ids and rejects empty updates', () => {
    expect(categoryInput.parse({ name: 'فرعي', parentId: '3' }).parentId).toBe(
      3,
    );
    expect(
      categoryInput.safeParse({ name: 'فرعي', parentId: 0 }).success,
    ).toBe(false);
    expect(categoryUpdateInput.safeParse({}).success).toBe(false);
    expect(
      categoryUpdateInput.parse({ name: 'جديد', parentId: null }),
    ).toEqual({ name: 'جديد', parentId: null });
  });
});
