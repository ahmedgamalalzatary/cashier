import type { Db } from '../../db/index.js';
import { PurchasesController } from './purchases.controller.js';
import { PurchasesRepository } from './purchases.repository.js';
import { purchasesRouter } from './purchases.router.js';
import { PurchasesService } from './purchases.service.js';

export function createPurchasesModule(db: Db) {
  const repository = new PurchasesRepository(db);
  const service = new PurchasesService(repository);
  const controller = new PurchasesController(service);
  return purchasesRouter(controller);
}
