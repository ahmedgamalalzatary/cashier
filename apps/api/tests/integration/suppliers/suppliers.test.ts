import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../../src/app.js';
import { appOptions, db } from '../../support/setup.js';
import { loginAs } from '../../support/helpers.js';

const app = () => createApp(db, appOptions);
let authorization: { readonly Authorization: string };
const api = () => ({
  get: (url: string) => request(app()).get(url).set(authorization),
  post: (url: string) => request(app()).post(url).set(authorization),
  put: (url: string) => request(app()).put(url).set(authorization),
  delete: (url: string) => request(app()).delete(url).set(authorization),
});

beforeEach(async () => {
  authorization = await loginAs(app(), 'admin');
});

async function createSupplier(overrides = {}) {
  const res = await api()
    .post('/api/suppliers')
    .send({
      name: 'مورد الألبان',
      phone: '01000000000',
      openingBalance: 500,
      ...overrides,
    });
  return res;
}

describe('suppliers CRUD', () => {
  it('creates and lists a supplier with computed balance', async () => {
    const created = await createSupplier();
    expect(created.status).toBe(201);
    expect(created.body.id).toBeTypeOf('number');

    const list = await api().get('/api/suppliers');
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].name).toBe('مورد الألبان');
    expect(Number(list.body[0].balance)).toBe(500);
  });

  it('rejects invalid input', async () => {
    const res = await api().post('/api/suppliers').send({ name: '' });
    expect(res.status).toBe(400);
  });

  it('updates a supplier', async () => {
    const { body } = await createSupplier();
    const res = await api()
      .put(`/api/suppliers/${body.id}`)
      .send({ name: 'مورد جديد' });
    expect(res.status).toBe(200);
    const list = await api().get('/api/suppliers');
    expect(list.body[0].name).toBe('مورد جديد');
  });

  it('soft-deletes a supplier (kept in list as inactive)', async () => {
    const { body } = await createSupplier();
    const res = await api().delete(`/api/suppliers/${body.id}`);
    expect(res.status).toBe(200);
    const list = await api().get('/api/suppliers');
    expect(list.body[0].isActive).toBeFalsy();
  });

  it('reactivates a deactivated supplier', async () => {
    const { body } = await createSupplier();
    expect((await api().delete(`/api/suppliers/${body.id}`)).status).toBe(200);

    const restored = await api()
      .put(`/api/suppliers/${body.id}`)
      .send({ isActive: true });

    expect(restored.status).toBe(200);
    const list = await api().get('/api/suppliers');
    expect(list.body[0].isActive).toBe(true);
  });

  it('normalizes blank optional supplier fields to null', async () => {
    const { body } = await createSupplier({
      phone: '   ',
      address: '',
      notes: ' ',
    });

    const list = await api().get('/api/suppliers');
    expect(list.body[0]).toMatchObject({
      id: body.id,
      phone: null,
      address: null,
      notes: null,
    });
  });

  it('rejects an empty update body', async () => {
    const { body } = await createSupplier();
    const res = await api().put(`/api/suppliers/${body.id}`).send({});
    expect(res.status).toBe(400);
  });

  it('404s on missing supplier', async () => {
    const res = await api().put('/api/suppliers/999').send({ name: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('supplier payments & statement', () => {
  let supplierId: number;
  beforeEach(async () => {
    const { body } = await createSupplier();
    supplierId = body.id;
  });

  it('records a payment and reduces the balance', async () => {
    const pay = await api()
      .post(`/api/suppliers/${supplierId}/payments`)
      .send({ amount: 200, paidAt: '2026-07-19', notes: 'دفعة نقدية' });
    expect(pay.status).toBe(201);

    const list = await api().get('/api/suppliers');
    expect(Number(list.body[0].balance)).toBe(300);
  });

  it('normalizes blank payment notes to null', async () => {
    const pay = await api()
      .post(`/api/suppliers/${supplierId}/payments`)
      .send({ amount: 20, paidAt: '2026-07-19', notes: '   ' });
    expect(pay.status).toBe(201);

    const statement = await api().get(`/api/suppliers/${supplierId}/statement`);
    expect(statement.body.payments[0].notes).toBeNull();
  });

  it('rejects an amount with more than two fractional digits', async () => {
    const res = await api()
      .post(`/api/suppliers/${supplierId}/payments`)
      .send({ amount: 0.004, paidAt: '2026-07-19' });
    expect(res.status).toBe(400);
  });

  it('rejects a non-positive payment', async () => {
    const res = await api()
      .post(`/api/suppliers/${supplierId}/payments`)
      .send({ amount: 0, paidAt: '2026-07-19' });
    expect(res.status).toBe(400);
  });

  it('returns a statement with payments', async () => {
    await api()
      .post(`/api/suppliers/${supplierId}/payments`)
      .send({ amount: 100, paidAt: '2026-07-18' });
    await api()
      .post(`/api/suppliers/${supplierId}/payments`)
      .send({ amount: 50, paidAt: '2026-07-19' });

    const res = await api().get(`/api/suppliers/${supplierId}/statement`);
    expect(res.status).toBe(200);
    expect(Number(res.body.supplier.balance)).toBe(350);
    expect(res.body.payments).toHaveLength(2);
    expect(res.body.payments[0].paidAt).toBe('2026-07-18');
  });
});
