import express from 'express';
import cors from 'cors';
import type { Db } from './db/index.js';
import { errorHandler } from './middleware/error.js';
import { createSuppliersModule } from './modules/suppliers/suppliers.module.js';

export function createApp(db: Db) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/suppliers', createSuppliersModule(db));

  app.use(errorHandler);
  return app;
}
