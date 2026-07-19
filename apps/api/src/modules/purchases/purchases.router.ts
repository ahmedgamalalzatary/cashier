import { Router } from 'express';
import type { PurchasesController } from './purchases.controller.js';

export function purchasesRouter(controller: PurchasesController) {
  const router = Router();
  router.get('/', controller.list);
  router.post('/', controller.create);
  router.get('/:id', controller.get);
  return router;
}
