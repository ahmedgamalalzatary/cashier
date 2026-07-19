import type { Db } from '../../db/index.js';
import { CategoriesRepository } from './categories.repository.js';
import { CategoriesService } from './categories.service.js';
import { CategoriesController } from './categories.controller.js';
import { categoriesRouter } from './categories.router.js';

export function createCategoriesModule(db: Db) {
  const repository = new CategoriesRepository(db);
  const service = new CategoriesService(repository);
  const controller = new CategoriesController(service);
  return categoriesRouter(controller);
}
