import type { Db } from '../../db/index.js';
import { SuppliersRepository } from './suppliers.repository.js';
import { SuppliersService } from './suppliers.service.js';
import { SuppliersController } from './suppliers.controller.js';
import { suppliersRouter } from './suppliers.router.js';

export function createSuppliersModule(db: Db) {
  const repository = new SuppliersRepository(db);
  const service = new SuppliersService(repository);
  const controller = new SuppliersController(service);
  return suppliersRouter(controller);
}
