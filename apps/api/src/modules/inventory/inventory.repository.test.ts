import { drizzle } from 'drizzle-orm/mysql-proxy';
import { describe, expect, it } from 'vitest';
import type { Db } from '../../db/index.js';
import * as schema from '../../db/schema.js';
import { InventoryRepository } from './inventory.repository.js';

describe('InventoryRepository deficit locking', () => {
  it('locks the outer stock movement rows while retaining the allocation subquery', () => {
    const db = drizzle(async () => ({ rows: [] }), {
      schema,
      mode: 'default',
    }) as unknown as Db;
    const query = new InventoryRepository(db).outstandingDeficits(7, 'main');
    const generated = query.toSQL().sql.toLowerCase();

    expect(generated).toContain('from `stock_movements`');
    expect(generated).toContain('from stock_deficit_allocations sda');
    expect(generated).toMatch(/for update\s*$/);
  });
});
