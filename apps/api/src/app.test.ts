import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import type { Db } from './db/index.js';

const db = {} as Db;
const options = {
  jwtSecret: 'test-only-jwt-secret-at-least-32-characters',
  corsOrigin: 'https://cashier.example.com',
};

describe('health check', () => {
  it('responds ok', async () => {
    const res = await request(createApp(db, options)).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('allows the configured frontend origin', async () => {
    const res = await request(createApp(db, options))
      .options('/health')
      .set('Origin', options.corsOrigin);
    expect(res.headers['access-control-allow-origin']).toBe(options.corsOrigin);
  });

  it('does not grant CORS access to any other origin', async () => {
    const res = await request(createApp(db, options))
      .options('/health')
      .set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
