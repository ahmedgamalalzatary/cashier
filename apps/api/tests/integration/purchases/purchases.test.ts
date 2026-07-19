import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createApp } from '../../../src/app.js';
import {
  categories,
  items,
  purchaseInvoices,
  stockDeficitAllocations,
  stockBatches,
  stockMovements,
  supplierPayments,
  suppliers,
} from '../../../src/db/schema.js';
import { appOptions, db } from '../../support/setup.js';
import { loginAs } from '../../support/helpers.js';

const app = () => createApp(db, appOptions);
let authorization: { readonly Authorization: string };

beforeEach(async () => {
  authorization = await loginAs(app(), 'admin');
});

async function createPurchaseFixture() {
  const [supplierResult] = await db.insert(suppliers).values({
    name: 'مورد البن',
  });
  const [categoryResult] = await db.insert(categories).values({
    name: 'خامات',
  });
  const [itemResult] = await db.insert(items).values({
    name: 'بن',
    categoryId: categoryResult.insertId,
    type: 'raw',
    stockUnit: 'كجم',
    purchaseUnit: 'شيكارة',
    purchaseToStockFactor: '25.000000',
  });
  return {
    supplierId: supplierResult.insertId,
    itemId: itemResult.insertId,
  };
}

describe('purchase invoices', () => {
  it('confirms a purchase-unit line into a main-warehouse FIFO batch', async () => {
    const fixture = await createPurchaseFixture();

    const response = await request(app())
      .post('/api/purchases')
      .set(authorization)
      .send({
        supplierId: fixture.supplierId,
        invoiceNumber: 'INV-100',
        purchasedAt: '2026-07-19',
        paidAmount: 0,
        notes: 'توريد أول المدة',
        lines: [
          {
            itemId: fixture.itemId,
            quantity: 2,
            unitMode: 'purchase',
            unitPrice: 300,
          },
        ],
      });

    expect(response.status).toBe(201);
    expect(response.body.id).toBeTypeOf('number');

    const [batch] = await db
      .select()
      .from(stockBatches)
      .where(eq(stockBatches.sourceId, response.body.id));
    expect(batch).toMatchObject({
      itemId: fixture.itemId,
      warehouse: 'main',
      initialQuantity: '50.000',
      remainingQuantity: '50.000',
      unitCost: '12.000000',
      sourceType: 'purchase',
    });

    const [movement] = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.referenceId, response.body.id));
    expect(movement).toMatchObject({
      batchId: batch.id,
      movementType: 'purchase',
      quantity: '50.000',
      referenceType: 'purchase_invoice',
    });
  });

  it('records a partial payment and exposes invoice details and supplier running balance', async () => {
    const fixture = await createPurchaseFixture();

    const created = await request(app())
      .post('/api/purchases')
      .set(authorization)
      .send({
        supplierId: fixture.supplierId,
        invoiceNumber: 'INV-101',
        purchasedAt: '2026-07-20',
        paidAmount: 100,
        lines: [
          {
            itemId: fixture.itemId,
            quantity: 10,
            unitMode: 'stock',
            unitPrice: 30,
          },
        ],
      });
    expect(created.status).toBe(201);

    const list = await request(app()).get('/api/purchases').set(authorization);
    expect(list.status).toBe(200);
    expect(list.body).toEqual([
      expect.objectContaining({
        id: created.body.id,
        supplierId: fixture.supplierId,
        supplierName: 'مورد البن',
        invoiceNumber: 'INV-101',
        totalAmount: '300.00',
        paidAmount: '100.00',
        dueAmount: '200.00',
      }),
    ]);

    const detail = await request(app())
      .get(`/api/purchases/${created.body.id}`)
      .set(authorization);
    expect(detail.status).toBe(200);
    expect(detail.body.lines).toEqual([
      expect.objectContaining({
        itemId: fixture.itemId,
        itemName: 'بن',
        quantity: '10.000',
        unitMode: 'stock',
        unitName: 'كجم',
        stockQuantity: '10.000',
        stockUnit: 'كجم',
        lineTotal: '300.00',
      }),
    ]);

    const suppliersList = await request(app())
      .get('/api/suppliers')
      .set(authorization);
    expect(suppliersList.body[0].balance).toBe('200.00');

    const statement = await request(app())
      .get(`/api/suppliers/${fixture.supplierId}/statement`)
      .set(authorization);
    expect(statement.status).toBe(200);
    expect(statement.body.movements).toEqual([
      expect.objectContaining({
        type: 'purchase',
        referenceId: created.body.id,
        amount: '300.00',
        balanceAfter: '300.00',
      }),
      expect.objectContaining({
        type: 'payment',
        amount: '-100.00',
        balanceAfter: '200.00',
      }),
    ]);
  });

  it('rejects a computed invoice total outside the money column range', async () => {
    const fixture = await createPurchaseFixture();

    const response = await request(app())
      .post('/api/purchases')
      .set(authorization)
      .send({
        supplierId: fixture.supplierId,
        purchasedAt: '2026-07-20',
        paidAmount: 0,
        lines: [
          {
            itemId: fixture.itemId,
            quantity: 99_999_999_999,
            unitMode: 'stock',
            unitPrice: 9_999_999_999,
          },
        ],
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('إجمالي');

    const batches = await db.select().from(stockBatches);
    expect(batches).toHaveLength(0);
  });

  it('keeps long invoice notes on the document without overflowing stock movements', async () => {
    const fixture = await createPurchaseFixture();
    const notes = 'م'.repeat(300);

    const response = await request(app())
      .post('/api/purchases')
      .set(authorization)
      .send({
        supplierId: fixture.supplierId,
        purchasedAt: '2026-07-20',
        paidAmount: 0,
        notes,
        lines: [
          {
            itemId: fixture.itemId,
            quantity: 1,
            unitMode: 'stock',
            unitPrice: 10,
          },
        ],
      });

    expect(response.status).toBe(201);
    const detail = await request(app())
      .get(`/api/purchases/${response.body.id}`)
      .set(authorization);
    expect(detail.body.notes).toBe(notes);

    const [movement] = await db.select().from(stockMovements);
    expect(movement.notes).toBeNull();
  });

  it('rejects converted stock quantities outside the database range', async () => {
    const fixture = await createPurchaseFixture();

    const response = await request(app())
      .post('/api/purchases')
      .set(authorization)
      .send({
        supplierId: fixture.supplierId,
        purchasedAt: '2026-07-20',
        paidAmount: 0,
        lines: [
          {
            itemId: fixture.itemId,
            quantity: 99_999_999_999.999,
            unitMode: 'purchase',
            unitPrice: 0.01,
          },
        ],
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('الكمية');
    expect(await db.select().from(purchaseInvoices)).toHaveLength(0);
    expect(await db.select().from(stockBatches)).toHaveLength(0);
  });

  it('blocks opening-balance edits after a credit purchase', async () => {
    const fixture = await createPurchaseFixture();
    const created = await request(app())
      .post('/api/purchases')
      .set(authorization)
      .send({
        supplierId: fixture.supplierId,
        purchasedAt: '2026-07-20',
        paidAmount: 0,
        lines: [
          {
            itemId: fixture.itemId,
            quantity: 1,
            unitMode: 'stock',
            unitPrice: 10,
          },
        ],
      });
    expect(created.status).toBe(201);

    const changed = await request(app())
      .put(`/api/suppliers/${fixture.supplierId}`)
      .set(authorization)
      .send({ openingBalance: 50 });

    expect(changed.status).toBe(409);
  });

  it('settles an exact half-cent-rounded invoice in full', async () => {
    const fixture = await createPurchaseFixture();

    const response = await request(app())
      .post('/api/purchases')
      .set(authorization)
      .send({
        supplierId: fixture.supplierId,
        purchasedAt: '2026-07-20',
        paidAmount: 4.02,
        lines: [
          {
            itemId: fixture.itemId,
            quantity: 0.005,
            unitMode: 'stock',
            unitPrice: 803,
          },
        ],
      });

    expect(response.status).toBe(201);
    const detail = await request(app())
      .get(`/api/purchases/${response.body.id}`)
      .set(authorization);
    expect(detail.body).toMatchObject({
      totalAmount: '4.02',
      paidAmount: '4.02',
      dueAmount: '0.00',
    });
    const suppliersList = await request(app())
      .get('/api/suppliers')
      .set(authorization);
    expect(suppliersList.body[0].balance).toBe('0.00');
  });

  it('serializes concurrent duplicate invoice numbers for one supplier', async () => {
    const fixture = await createPurchaseFixture();
    const body = {
      supplierId: fixture.supplierId,
      invoiceNumber: 'DUP-1',
      purchasedAt: '2026-07-20',
      paidAmount: 0,
      lines: [
        {
          itemId: fixture.itemId,
          quantity: 1,
          unitMode: 'stock',
          unitPrice: 10,
        },
      ],
    };

    const responses = await Promise.all([
      request(app()).post('/api/purchases').set(authorization).send(body),
      request(app()).post('/api/purchases').set(authorization).send(body),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect(await db.select().from(purchaseInvoices)).toHaveLength(1);
    expect(await db.select().from(stockBatches)).toHaveLength(1);
  });

  it('rolls back an overpaid invoice before creating financial or stock records', async () => {
    const fixture = await createPurchaseFixture();

    const response = await request(app())
      .post('/api/purchases')
      .set(authorization)
      .send({
        supplierId: fixture.supplierId,
        purchasedAt: '2026-07-20',
        paidAmount: 10.01,
        lines: [
          {
            itemId: fixture.itemId,
            quantity: 1,
            unitMode: 'stock',
            unitPrice: 10,
          },
        ],
      });

    expect(response.status).toBe(400);
    expect(await db.select().from(purchaseInvoices)).toHaveLength(0);
    expect(await db.select().from(supplierPayments)).toHaveLength(0);
    expect(await db.select().from(stockBatches)).toHaveLength(0);
    expect(await db.select().from(stockMovements)).toHaveLength(0);
  });

  it('allocates a purchase receipt against outstanding negative stock', async () => {
    const fixture = await createPurchaseFixture();
    const [deficit] = await db.insert(stockMovements).values({
      itemId: fixture.itemId,
      warehouse: 'main',
      batchId: null,
      movementType: 'adjustment',
      quantity: '-2.000',
      unitCost: '0.000000',
      occurredAt: new Date('2026-07-19T00:00:00.000Z'),
    });

    const response = await request(app())
      .post('/api/purchases')
      .set(authorization)
      .send({
        supplierId: fixture.supplierId,
        purchasedAt: '2026-07-20',
        paidAmount: 0,
        lines: [
          {
            itemId: fixture.itemId,
            quantity: 3,
            unitMode: 'stock',
            unitPrice: 10,
          },
        ],
      });

    expect(response.status).toBe(201);
    const [batch] = await db.select().from(stockBatches);
    expect(batch.remainingQuantity).toBe('1.000');
    const [allocation] = await db.select().from(stockDeficitAllocations);
    expect(allocation).toMatchObject({
      deficitMovementId: deficit.insertId,
      batchId: batch.id,
      quantity: '2.000',
      unitCost: '10.000000',
    });
  });
});
