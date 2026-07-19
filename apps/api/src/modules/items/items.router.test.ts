import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import type { ItemsController } from './items.controller.js';
import { itemsRouter } from './items.router.js';

describe('items route authorization', () => {
  it('applies the supplied admin guard to every currently admin-only route', async () => {
    const controller = {
      list: vi.fn((_req, res) => res.status(200).end()),
      create: vi.fn((_req, res) => res.status(201).end()),
      update: vi.fn((_req, res) => res.status(200).end()),
      deactivate: vi.fn((_req, res) => res.status(200).end()),
    } as unknown as ItemsController;
    const requireAdmin: RequestHandler = (_req, res) => {
      res.status(403).end();
    };
    const app = express();
    app.use(express.json(), itemsRouter(controller, requireAdmin));

    const responses = await Promise.all([
      request(app).get('/'),
      request(app).post('/').send({}),
      request(app).put('/1').send({}),
      request(app).delete('/1'),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([403, 403, 403, 403]);
    expect(controller.list).not.toHaveBeenCalled();
    expect(controller.create).not.toHaveBeenCalled();
    expect(controller.update).not.toHaveBeenCalled();
    expect(controller.deactivate).not.toHaveBeenCalled();
  });
});
