import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import type { AuthController } from './auth.controller.js';

export function authRouter(controller: AuthController) {
  const router = Router();
  router.post('/login', controller.login);
  router.get('/me', authenticate, controller.me);
  return router;
}
