import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { db } from '../tests/setup.js';

describe('health check', () => {
  it('responds ok', async () => {
    const res = await request(createApp(db)).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
