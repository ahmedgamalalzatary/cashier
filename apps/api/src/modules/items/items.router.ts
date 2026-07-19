import { Router } from 'express';
import type { RequestHandler } from 'express';
import type { ItemsController } from './items.controller.js';

export function itemsRouter(
  controller: ItemsController,
  requireAdmin: RequestHandler,
) {
  const router = Router();
  router.get('/', requireAdmin, controller.list);
  router.post('/', requireAdmin, controller.create);
  router.put('/:id', requireAdmin, controller.update);
  router.delete('/:id', requireAdmin, controller.deactivate);
  return router;
}
