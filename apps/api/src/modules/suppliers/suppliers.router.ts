import { Router } from 'express';
import type { SuppliersController } from './suppliers.controller.js';

// Express 5 forwards rejected promises to the error middleware automatically
export function suppliersRouter(controller: SuppliersController) {
  const router = Router();
  router.get('/', controller.list);
  router.post('/', controller.create);
  router.get('/:id', controller.get);
  router.put('/:id', controller.update);
  router.delete('/:id', controller.deactivate);
  router.post('/:id/payments', controller.addPayment);
  router.get('/:id/statement', controller.statement);
  return router;
}
