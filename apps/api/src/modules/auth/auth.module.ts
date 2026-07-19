import type { Db } from '../../db/index.js';
import { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { authRouter } from './auth.router.js';

export function createAuthModule(db: Db) {
  const repository = new AuthRepository(db);
  const service = new AuthService(repository);
  const controller = new AuthController(service);
  return authRouter(controller, db);
}
