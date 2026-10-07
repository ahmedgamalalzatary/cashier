import type { Db } from '@cashier/db';
import { RecipesController } from './recipes.controller.js';
import { RecipesRepository } from './recipes.repository.js';
import { recipesRouter } from './recipes.router.js';
import { RecipesService } from './recipes.service.js';

export function createRecipesModule(db: Db) {
  const repository = new RecipesRepository(db);
  const service = new RecipesService(repository);
  const controller = new RecipesController(service);
  return recipesRouter(controller);
}
