import { Router } from 'express';
import type { CategoriesController } from './categories.controller.js';

export function categoriesRouter(controller: CategoriesController) {
  const router = Router();
  router.get('/', controller.list);
  router.post('/', controller.create);
  router.put('/:id', controller.update);
  router.delete('/:id', controller.deactivate);
  return router;
}
