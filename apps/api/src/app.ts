import express from 'express';
import cors from 'cors';
import type { Db } from './db/index.js';
import { errorHandler } from './middleware/error.js';
import { authenticate, requireRole } from './middleware/auth.js';
import { createAuthModule } from './modules/auth/auth.module.js';
import { createSuppliersModule } from './modules/suppliers/suppliers.module.js';
import { createCategoriesModule } from './modules/categories/categories.module.js';

export type AppOptions = {
  jwtSecret: string;
  corsOrigin: string;
  trustProxy?: boolean;
};

export function createApp(
  db: Db,
  { jwtSecret, corsOrigin, trustProxy = false }: AppOptions,
) {
  const app = express();
  app.set('trust proxy', trustProxy ? 1 : false);
  app.use(
    cors({
      origin: (origin, callback) =>
        callback(null, !origin || origin === corsOrigin),
    }),
  );
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/auth', createAuthModule(db, jwtSecret));

  // admin-only sections per spec §2 permission matrix
  const adminOnly = [
    authenticate(db, jwtSecret),
    requireRole('admin'),
  ] as const;
  app.use('/api/suppliers', ...adminOnly, createSuppliersModule(db));
  app.use('/api/categories', ...adminOnly, createCategoriesModule(db));

  app.use(errorHandler);
  return app;
}
