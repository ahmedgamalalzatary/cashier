import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import type { Db } from '../../db/index.js';
import type { AuthController } from './auth.controller.js';

export function authRouter(controller: AuthController, db: Db) {
  const router = Router();
  router.post('/login', controller.login);
  router.get('/me', authenticate(db), controller.me);
  return router;
}
