import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { db } from './setup.js';
import { loginAs } from './helpers.js';

const app = () => createApp(db);
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

async function createCategory(name: string, parentId?: number) {
  return api().post('/api/categories').send({ name, parentId });
}

describe('categories', () => {
  it('creates a main category and a sub under it', async () => {
    const main = await createCategory('مشروبات ساخنة');
    expect(main.status).toBe(201);

    const sub = await createCategory('قهوة', main.body.id);
    expect(sub.status).toBe(201);

    const list = await api().get('/api/categories');
    expect(list.body).toHaveLength(2);
    const subRow = list.body.find((c: { name: string }) => c.name === 'قهوة');
    expect(subRow.parentId).toBe(main.body.id);
  });

  it('rejects a sub under a sub (two levels max)', async () => {
    const main = await createCategory('مشروبات');
    const sub = await createCategory('عصائر', main.body.id);
    const res = await createCategory('برتقال', sub.body.id);
    expect(res.status).toBe(400);
  });

  it('rejects a missing parent', async () => {
    const res = await createCategory('يتيم', 999);
    expect(res.status).toBe(400);
  });

  it('renames a category', async () => {
    const main = await createCategory('حلويات');
    const res = await api()
      .put(`/api/categories/${main.body.id}`)
      .send({ name: 'حلويات شرقية' });
    expect(res.status).toBe(200);
    const list = await api().get('/api/categories');
    expect(list.body[0].name).toBe('حلويات شرقية');
  });

  it('rejects making a category its own parent', async () => {
    const main = await createCategory('مأكولات');
    const res = await api()
      .put(`/api/categories/${main.body.id}`)
      .send({ parentId: main.body.id });
    expect(res.status).toBe(400);
  });

  it('rejects moving a main with subs under another category', async () => {
    const a = await createCategory('أ');
    await createCategory('أ-فرعي', a.body.id);
    const b = await createCategory('ب');
    const res = await api()
      .put(`/api/categories/${a.body.id}`)
      .send({ parentId: b.body.id });
    expect(res.status).toBe(400);
  });

  it('serializes simultaneous inverse moves without deadlocking', async () => {
    const a = await createCategory('أ');
    const b = await createCategory('ب');

    const results = await Promise.all([
      api().put(`/api/categories/${a.body.id}`).send({ parentId: b.body.id }),
      api().put(`/api/categories/${b.body.id}`).send({ parentId: a.body.id }),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([200, 400]);
    const rows: Array<{ id: number; parentId: number | null }> = (await api().get('/api/categories')).body;
    const rowA = rows.find((row) => row.id === a.body.id);
    const rowB = rows.find((row) => row.id === b.body.id);
    expect(rowA?.parentId === b.body.id && rowB?.parentId === a.body.id).toBe(false);
  });

  it('deactivating a main deactivates its subs', async () => {
    const main = await createCategory('مثلجات');
    const sub = await createCategory('آيس كريم', main.body.id);
    const res = await api().delete(`/api/categories/${main.body.id}`);
    expect(res.status).toBe(200);
    const list = await api().get('/api/categories');
    const rows: Array<{ id: number; isActive: boolean }> = list.body;
    const mainRow = rows.find((c) => c.id === main.body.id);
    const subRow = rows.find((c) => c.id === sub.body.id);
    expect(mainRow?.isActive).toBeFalsy();
    expect(subRow?.isActive).toBeFalsy();
  });

  it('rejects creating a sub under a deactivated main', async () => {
    const main = await createCategory('مخبوزات');
    await api().delete(`/api/categories/${main.body.id}`);
    const res = await createCategory('كرواسون', main.body.id);
    expect(res.status).toBe(400);
  });

  it('404s on a missing category', async () => {
    const res = await api().delete('/api/categories/999');
    expect(res.status).toBe(404);
  });
});
