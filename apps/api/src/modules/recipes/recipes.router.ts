import { Router } from 'express';
import type { RecipesController } from './recipes.controller.js';

export function recipesRouter(controller: RecipesController) {
  const router = Router();
  router.get('/preparations', controller.listPreparations);
  router.get('/preparations/:id', controller.getPreparation);
  router.get('/', controller.list);
  router.post('/', controller.create);
  router.get('/:id', controller.get);
  router.put('/:id', controller.update);
  router.delete('/:id', controller.deactivate);
  router.put('/:id/active', controller.reactivate);
  router.post('/:id/prepare', controller.prepare);
  return router;
}
