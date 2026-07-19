import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { and, eq } from 'drizzle-orm';
import { createApp } from '../../../src/app.js';
import {
  categories,
  items,
  stockBatches,
  stockMovements,
} from '../../../src/db/schema.js';
import { appOptions, db } from '../../support/setup.js';
import { createUser, loginAs } from '../../support/helpers.js';

const app = () => createApp(db, appOptions);
let adminAuthorization: { readonly Authorization: string };
let cashierAuthorization: { readonly Authorization: string };

beforeEach(async () => {
  adminAuthorization = await loginAs(app(), 'admin');
  cashierAuthorization = await loginAs(app(), 'cashier');
});

async function loginSecondCashier() {
  const credentials = await createUser('cashier', 'cashier-two');
  const response = await request(app()).post('/api/auth/login').send(credentials);
  return { Authorization: `Bearer ${response.body.token}` } as const;
}

async function createItem(name = 'بن') {
  const [category] = await db.insert(categories).values({ name: 'خامات' });
  const [item] = await db.insert(items).values({
    name,
    categoryId: category.insertId,
    type: 'raw',
    stockUnit: 'كجم',
  });
  return item.insertId;
}

async function receiveMainBatch(
  itemId: number,
  quantity: string,
  unitCost: string,
  receivedAt: Date,
) {
  const [batch] = await db.insert(stockBatches).values({
    itemId,
    warehouse: 'main',
    initialQuantity: quantity,
    remainingQuantity: quantity,
    unitCost,
    receivedAt,
    sourceType: 'purchase',
  });
  await db.insert(stockMovements).values({
    itemId,
    warehouse: 'main',
    batchId: batch.insertId,
    movementType: 'purchase',
    quantity,
    unitCost,
    occurredAt: receivedAt,
  });
  return batch.insertId;
}

async function createRequest(
  authorization: { readonly Authorization: string },
  itemId: number,
  quantity = 1,
) {
  return request(app())
    .post('/api/transfers/requests')
    .set(authorization)
    .send({ notes: 'احتياج الوردية', lines: [{ itemId, quantity }] });
}

describe('cafe transfer requests and transfers', () => {
  it('lets cashiers create requests and lets every cashier see them', async () => {
    const itemId = await createItem();
    const created = await createRequest(cashierAuthorization, itemId, 3.5);
    expect(created.status).toBe(201);

    const secondCashierAuthorization = await loginSecondCashier();
    const list = await request(app())
      .get('/api/transfers/requests')
      .set(secondCashierAuthorization);

    expect(list.status).toBe(200);
    expect(list.body).toEqual([
      expect.objectContaining({
        id: created.body.id,
        status: 'pending',
        requestedByName: 'كاشير',
        notes: 'احتياج الوردية',
        lineCount: 1,
      }),
    ]);

    const detail = await request(app())
      .get(`/api/transfers/requests/${created.body.id}`)
      .set(secondCashierAuthorization);
    expect(detail.status).toBe(200);
    expect(detail.body.lines).toEqual([
      expect.objectContaining({ itemId, itemName: 'بن', quantity: '3.500' }),
    ]);
  });

  it('approves edited quantities and preserves every main FIFO batch cost in cafe stock', async () => {
    const itemId = await createItem();
    const firstBatchId = await receiveMainBatch(
      itemId,
      '2.000',
      '10.000000',
      new Date('2026-07-18T00:00:00.000Z'),
    );
    const secondBatchId = await receiveMainBatch(
      itemId,
      '3.000',
      '20.000000',
      new Date('2026-07-19T00:00:00.000Z'),
    );
    const created = await createRequest(cashierAuthorization, itemId, 5);

    const approved = await request(app())
      .post(`/api/transfers/requests/${created.body.id}/approve`)
      .set(adminAuthorization)
      .send({ lines: [{ itemId, quantity: 4 }] });

    expect(approved.status).toBe(201);
    expect(approved.body.transferId).toBeTypeOf('number');

    const [firstMainBatch] = await db
      .select()
      .from(stockBatches)
      .where(eq(stockBatches.id, firstBatchId));
    const [secondMainBatch] = await db
      .select()
      .from(stockBatches)
      .where(eq(stockBatches.id, secondBatchId));
    expect(firstMainBatch.remainingQuantity).toBe('0.000');
    expect(secondMainBatch.remainingQuantity).toBe('1.000');

    const cafeBatches = await db
      .select()
      .from(stockBatches)
      .where(
        and(eq(stockBatches.itemId, itemId), eq(stockBatches.warehouse, 'cafe')),
      )
      .orderBy(stockBatches.id);
    expect(cafeBatches).toEqual([
      expect.objectContaining({
        initialQuantity: '2.000',
        remainingQuantity: '2.000',
        unitCost: '10.000000',
        sourceType: 'transfer_in',
      }),
      expect.objectContaining({
        initialQuantity: '2.000',
        remainingQuantity: '2.000',
        unitCost: '20.000000',
        sourceType: 'transfer_in',
      }),
    ]);

    const detail = await request(app())
      .get(`/api/transfers/${approved.body.transferId}`)
      .set(cashierAuthorization);
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({
      requestId: created.body.id,
      createdByName: 'كاشير',
      approvedByName: 'مدير',
      totalCost: '60.00',
    });
    expect(detail.body.lines).toEqual([
      expect.objectContaining({
        itemId,
        quantity: '2.000',
        unitCost: '10.000000',
        lineCost: '20.00',
        sourceBatchId: firstBatchId,
      }),
      expect.objectContaining({
        itemId,
        quantity: '2.000',
        unitCost: '20.000000',
        lineCost: '40.00',
        sourceBatchId: secondBatchId,
      }),
    ]);

    const cafeStock = await request(app())
      .get('/api/inventory/cafe/stock')
      .set(cashierAuthorization);
    expect(cafeStock.body[0]).toMatchObject({
      itemId,
      quantity: '4.000',
      stockValue: '60.000000000',
    });
  });

  it('rejects insufficient approvals atomically and leaves the request pending', async () => {
    const itemId = await createItem();
    const batchId = await receiveMainBatch(
      itemId,
      '2.000',
      '10.000000',
      new Date('2026-07-19T00:00:00.000Z'),
    );
    const created = await createRequest(cashierAuthorization, itemId, 3);

    const approved = await request(app())
      .post(`/api/transfers/requests/${created.body.id}/approve`)
      .set(adminAuthorization)
      .send({ lines: [{ itemId, quantity: 3 }] });

    expect(approved.status).toBe(409);
    const detail = await request(app())
      .get(`/api/transfers/requests/${created.body.id}`)
      .set(cashierAuthorization);
    expect(detail.body.status).toBe('pending');
    expect(
      await request(app()).get('/api/transfers').set(cashierAuthorization),
    ).toMatchObject({ status: 200, body: [] });
    const [batch] = await db
      .select()
      .from(stockBatches)
      .where(eq(stockBatches.id, batchId));
    expect(batch.remainingQuantity).toBe('2.000');
    const cafeMovements = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.warehouse, 'cafe'));
    expect(cafeMovements).toHaveLength(0);
  });

  it('rejects approval when it omits an originally requested item', async () => {
    const firstItemId = await createItem('بن');
    const secondItemId = await createItem('سكر');
    await receiveMainBatch(
      firstItemId,
      '1.000',
      '10.000000',
      new Date('2026-07-19T00:00:00.000Z'),
    );
    const created = await request(app())
      .post('/api/transfers/requests')
      .set(cashierAuthorization)
      .send({
        lines: [
          { itemId: firstItemId, quantity: 1 },
          { itemId: secondItemId, quantity: 1 },
        ],
      });
    expect(created.status).toBe(201);

    const approved = await request(app())
      .post(`/api/transfers/requests/${created.body.id}/approve`)
      .set(adminAuthorization)
      .send({ lines: [{ itemId: firstItemId, quantity: 1 }] });

    expect(approved.status).toBe(400);
    const detail = await request(app())
      .get(`/api/transfers/requests/${created.body.id}`)
      .set(cashierAuthorization);
    expect(detail.body.status).toBe('pending');
  });

  it('serializes simultaneous approvals so exactly one transfer commits', async () => {
    const itemId = await createItem();
    await receiveMainBatch(
      itemId,
      '2.000',
      '10.000000',
      new Date('2026-07-19T00:00:00.000Z'),
    );
    const created = await createRequest(cashierAuthorization, itemId, 1);
    const approve = () =>
      request(app())
        .post(`/api/transfers/requests/${created.body.id}/approve`)
        .set(adminAuthorization)
        .send({ lines: [{ itemId, quantity: 1 }] });

    const responses = await Promise.all([approve(), approve()]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    const transfers = await request(app())
      .get('/api/transfers')
      .set(cashierAuthorization);
    expect(transfers.body).toHaveLength(1);
    const cafeStock = await request(app())
      .get('/api/inventory/cafe/stock')
      .set(cashierAuthorization);
    expect(cafeStock.body[0].quantity).toBe('1.000');
  });

  it('allows only admins to reject pending requests and records the reason', async () => {
    const itemId = await createItem();
    const created = await createRequest(cashierAuthorization, itemId, 1);

    const forbidden = await request(app())
      .post(`/api/transfers/requests/${created.body.id}/reject`)
      .set(cashierAuthorization)
      .send({ reason: 'الرصيد غير مطلوب' });
    expect(forbidden.status).toBe(403);

    const rejected = await request(app())
      .post(`/api/transfers/requests/${created.body.id}/reject`)
      .set(adminAuthorization)
      .send({ reason: 'الرصيد غير مطلوب' });
    expect(rejected.status).toBe(200);

    const detail = await request(app())
      .get(`/api/transfers/requests/${created.body.id}`)
      .set(cashierAuthorization);
    expect(detail.body).toMatchObject({
      status: 'rejected',
      rejectionReason: 'الرصيد غير مطلوب',
      reviewedByName: 'مدير',
    });

    const approveRejected = await request(app())
      .post(`/api/transfers/requests/${created.body.id}/approve`)
      .set(adminAuthorization)
      .send({ lines: [{ itemId, quantity: 1 }] });
    expect(approveRejected.status).toBe(409);
  });

  it('allows admins to create direct transfers but rejects cashier access', async () => {
    const itemId = await createItem();
    await receiveMainBatch(
      itemId,
      '2.000',
      '10.000000',
      new Date('2026-07-19T00:00:00.000Z'),
    );
    const body = { notes: 'تحويل مباشر', lines: [{ itemId, quantity: 1 }] };

    const forbidden = await request(app())
      .post('/api/transfers/direct')
      .set(cashierAuthorization)
      .send(body);
    expect(forbidden.status).toBe(403);

    const created = await request(app())
      .post('/api/transfers/direct')
      .set(adminAuthorization)
      .send(body);
    expect(created.status).toBe(201);

    const detail = await request(app())
      .get(`/api/transfers/${created.body.transferId}`)
      .set(cashierAuthorization);
    expect(detail.body).toMatchObject({
      requestId: null,
      createdByName: 'مدير',
      approvedByName: 'مدير',
      notes: 'تحويل مباشر',
    });
  });

  it('reports large transfer costs without overflowing list calculations', async () => {
    const itemId = await createItem();
    await receiveMainBatch(
      itemId,
      '100000000.000',
      '9999999999.000000',
      new Date('2026-07-19T00:00:00.000Z'),
    );

    const created = await request(app())
      .post('/api/transfers/direct')
      .set(adminAuthorization)
      .send({ lines: [{ itemId, quantity: 100000000 }] });
    expect(created.status).toBe(201);

    const list = await request(app()).get('/api/transfers').set(adminAuthorization);
    expect(list.status).toBe(200);
    expect(list.body[0].totalCost).toBe('999999999900000000.00');
  });

  it('reconciles the total with individually rounded half-cent allocations', async () => {
    const itemId = await createItem();
    await receiveMainBatch(
      itemId,
      '1.000',
      '0.005000',
      new Date('2026-07-18T00:00:00.000Z'),
    );
    await receiveMainBatch(
      itemId,
      '1.000',
      '0.005000',
      new Date('2026-07-19T00:00:00.000Z'),
    );

    const created = await request(app())
      .post('/api/transfers/direct')
      .set(adminAuthorization)
      .send({ lines: [{ itemId, quantity: 2 }] });
    expect(created.status).toBe(201);

    const detail = await request(app())
      .get(`/api/transfers/${created.body.transferId}`)
      .set(adminAuthorization);
    expect(detail.body.lines.map((line: { lineCost: string }) => line.lineCost)).toEqual([
      '0.01',
      '0.01',
    ]);
    expect(detail.body.totalCost).toBe('0.02');
  });
});
