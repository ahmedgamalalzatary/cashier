import type { Db } from '../../db/index.js';
import type { RequestHandler } from 'express';
import { ItemsController } from './items.controller.js';
import { ItemsRepository } from './items.repository.js';
import { itemsRouter } from './items.router.js';
import { ItemsService } from './items.service.js';

export function createItemsModule(db: Db, requireAdmin: RequestHandler) {
  const repository = new ItemsRepository(db);
  const service = new ItemsService(repository);
  const controller = new ItemsController(service);
  return itemsRouter(controller, requireAdmin);
}
