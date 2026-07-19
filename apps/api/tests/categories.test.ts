import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { db } from './setup.js';

const app = () => createApp(db);

async function createCategory(name: string, parentId?: number) {
  return request(app()).post('/api/categories').send({ name, parentId });
}

describe('categories', () => {
  it('creates a main category and a sub under it', async () => {
    const main = await createCategory('مشروبات ساخنة');
    expect(main.status).toBe(201);

    const sub = await createCategory('قهوة', main.body.id);
    expect(sub.status).toBe(201);

    const list = await request(app()).get('/api/categories');
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
    const res = await request(app())
      .put(`/api/categories/${main.body.id}`)
      .send({ name: 'حلويات شرقية' });
    expect(res.status).toBe(200);
    const list = await request(app()).get('/api/categories');
    expect(list.body[0].name).toBe('حلويات شرقية');
  });

  it('rejects making a category its own parent', async () => {
    const main = await createCategory('مأكولات');
    const res = await request(app())
      .put(`/api/categories/${main.body.id}`)
      .send({ parentId: main.body.id });
    expect(res.status).toBe(400);
  });

  it('rejects moving a main with subs under another category', async () => {
    const a = await createCategory('أ');
    await createCategory('أ-فرعي', a.body.id);
    const b = await createCategory('ب');
    const res = await request(app())
      .put(`/api/categories/${a.body.id}`)
      .send({ parentId: b.body.id });
    expect(res.status).toBe(400);
  });

  it('deactivating a main deactivates its subs', async () => {
    const main = await createCategory('مثلجات');
    const sub = await createCategory('آيس كريم', main.body.id);
    const res = await request(app()).delete(`/api/categories/${main.body.id}`);
    expect(res.status).toBe(200);
    const list = await request(app()).get('/api/categories');
    const rows: Array<{ id: number; isActive: boolean }> = list.body;
    const mainRow = rows.find((c) => c.id === main.body.id);
    const subRow = rows.find((c) => c.id === sub.body.id);
    expect(mainRow?.isActive).toBeFalsy();
    expect(subRow?.isActive).toBeFalsy();
  });

  it('rejects creating a sub under a deactivated main', async () => {
    const main = await createCategory('مخبوزات');
    await request(app()).delete(`/api/categories/${main.body.id}`);
    const res = await createCategory('كرواسون', main.body.id);
    expect(res.status).toBe(400);
  });

  it('404s on a missing category', async () => {
    const res = await request(app()).delete('/api/categories/999');
    expect(res.status).toBe(404);
  });
});
