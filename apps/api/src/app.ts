import express from 'express';
import cors from 'cors';
import type { Db } from './db/index.js';
import { errorHandler } from './middleware/error.js';
import { authenticate, requireRole } from './middleware/auth.js';
import { createAuthModule } from './modules/auth/auth.module.js';
import { createSuppliersModule } from './modules/suppliers/suppliers.module.js';
import { createCategoriesModule } from './modules/categories/categories.module.js';

export function createApp(db: Db) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/auth', createAuthModule(db));

  // admin-only sections per spec §2 permission matrix
  const adminOnly = [authenticate(db), requireRole('admin')] as const;
  app.use('/api/suppliers', ...adminOnly, createSuppliersModule(db));
  app.use('/api/categories', ...adminOnly, createCategoriesModule(db));

  app.use(errorHandler);
  return app;
}
