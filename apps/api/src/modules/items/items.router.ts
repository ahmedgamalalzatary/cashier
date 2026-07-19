import { Router } from 'express';
import type { ItemsController } from './items.controller.js';

export function itemsRouter(controller: ItemsController) {
  const router = Router();
  router.get('/', controller.list);
  router.post('/', controller.create);
  router.put('/:id', controller.update);
  router.delete('/:id', controller.deactivate);
  return router;
}
