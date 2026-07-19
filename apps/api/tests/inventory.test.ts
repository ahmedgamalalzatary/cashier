import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { categories, items, stockBatches } from '../src/db/schema.js';
import { InventoryRepository } from '../src/modules/inventory/inventory.repository.js';
import type { InventoryRepositoryPort } from '../src/modules/inventory/inventory.repository.js';
import { InventoryService } from '../src/modules/inventory/inventory.service.js';
import { db } from './setup.js';

let itemId: number;
let service: InventoryService;

beforeEach(async () => {
  const [category] = await db.insert(categories).values({ name: 'خامات' });
  const [item] = await db.insert(items).values({
    name: 'بن',
    categoryId: category.insertId,
    type: 'raw',
    stockUnit: 'كجم',
  });
  itemId = item.insertId;
  service = new InventoryService(new InventoryRepository(db));
});

describe('MySQL FIFO inventory', () => {
  it('returns ordered per-batch allocations and rolls back an outer session', async () => {
    const occurredAt = new Date('2026-07-19T09:00:00Z');
    const consumed = await service.transaction(async (inventory) => {
      await inventory.receive({
        itemId,
        warehouse: 'main',
        quantity: 2,
        unitCost: '10',
        movementType: 'purchase',
        occurredAt,
      });
      await inventory.receive({
        itemId,
        warehouse: 'main',
        quantity: 3,
        unitCost: '12',
        movementType: 'purchase',
        occurredAt,
      });
      return inventory.consume({
        itemId,
        warehouse: 'main',
        quantity: 4,
        movementType: 'transfer_out',
      });
    });

    expect(consumed.allocations).toEqual([
      { batchId: 1, quantity: '2.000', unitCost: '10.000000' },
      { batchId: 2, quantity: '2.000', unitCost: '12.000000' },
    ]);

    await expect(
      service.transaction(async (inventory) => {
        await inventory.receive({
          itemId,
          warehouse: 'main',
          quantity: 1,
          unitCost: '20',
          movementType: 'purchase',
        });
        throw new Error('invoice failed');
      }),
    ).rejects.toThrow('invoice failed');
    const stock = await service.listStock('main');
    expect(stock[0].quantity).toBe('1.000');
  });

  it('rolls back a consume when available stock is insufficient', async () => {
    const receipt = await service.receive({
      itemId,
      warehouse: 'main',
      quantity: 2,
      unitCost: '5',
      movementType: 'purchase',
    });

    await expect(
      service.consume({
        itemId,
        warehouse: 'main',
        quantity: 3,
        movementType: 'transfer_out',
      }),
    ).rejects.toMatchObject({ status: 409 });
    const [batch] = await db
      .select()
      .from(stockBatches)
      .where(eq(stockBatches.id, receipt.batchId));
    expect(batch.remainingQuantity).toBe('2.000');
  });

  it('serializes concurrent consumes so stock cannot be overspent', async () => {
    await service.receive({
      itemId,
      warehouse: 'main',
      quantity: 5,
      unitCost: '5',
      movementType: 'purchase',
    });

    const results = await Promise.allSettled([
      service.consume({
        itemId,
        warehouse: 'main',
        quantity: 4,
        movementType: 'transfer_out',
      }),
      service.consume({
        itemId,
        warehouse: 'main',
        quantity: 4,
        movementType: 'transfer_out',
      }),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([
      'fulfilled',
      'rejected',
    ]);
    const stock = await service.listStock('main');
    expect(stock[0].quantity).toBe('1.000');
  });

  it('persists a cost allocation when a receipt covers negative stock', async () => {
    await service.consume({
      itemId,
      warehouse: 'cafe',
      quantity: 1,
      movementType: 'sale',
      allowNegative: true,
    });

    const receipt = await service.receive({
      itemId,
      warehouse: 'cafe',
      quantity: 3,
      unitCost: '8',
      movementType: 'transfer_in',
    });

    expect(receipt.deficitAllocations).toEqual([
      {
        deficitMovementId: expect.any(Number),
        batchId: receipt.batchId,
        quantity: '1.000',
        unitCost: '8.000000',
      },
    ]);
    const [batch] = await db
      .select()
      .from(stockBatches)
      .where(eq(stockBatches.id, receipt.batchId));
    expect(batch.remainingQuantity).toBe('2.000');
  });

  it('serializes concurrent receipts while allocating an outstanding deficit', async () => {
    await service.consume({
      itemId,
      warehouse: 'cafe',
      quantity: 1,
      movementType: 'sale',
      allowNegative: true,
    });

    let deficitReads = 0;
    const delayFirstDeficitRead = (repo: InventoryRepositoryPort) =>
      new Proxy(repo, {
        get(target, property, receiver) {
          if (property === 'outstandingDeficits') {
            return async (
              ...args: Parameters<typeof target.outstandingDeficits>
            ) => {
              const rows = await target.outstandingDeficits(...args);
              deficitReads += 1;
              if (deficitReads === 1) {
                await new Promise((resolve) => setTimeout(resolve, 100));
              }
              return rows;
            };
          }
          const value = Reflect.get(target, property, receiver);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    const repository = new InventoryRepository(db);
    const concurrentService = new InventoryService(
      new Proxy(repository, {
        get(target, property, receiver) {
          if (property === 'transaction') {
            return <T>(run: (repo: InventoryRepositoryPort) => Promise<T>) =>
              target.transaction((repo) => run(delayFirstDeficitRead(repo)));
          }
          const value = Reflect.get(target, property, receiver);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      }),
    );

    const receipts = await Promise.all([
      concurrentService.receive({
        itemId,
        warehouse: 'cafe',
        quantity: 1,
        unitCost: '8',
        movementType: 'transfer_in',
      }),
      concurrentService.receive({
        itemId,
        warehouse: 'cafe',
        quantity: 1,
        unitCost: '9',
        movementType: 'transfer_in',
      }),
    ]);

    expect(
      receipts.flatMap((receipt) => receipt.deficitAllocations),
    ).toHaveLength(1);
    const batches = await db.select().from(stockBatches);
    expect(
      batches.reduce(
        (total, batch) => total + Number(batch.remainingQuantity),
        0,
      ),
    ).toBe(1);
  });
});
