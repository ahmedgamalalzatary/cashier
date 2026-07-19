import type { RequestHandler } from 'express';
import type { Db } from '../../db/index.js';
import { TransfersController } from './transfers.controller.js';
import { TransfersRepository } from './transfers.repository.js';
import { transfersRouter } from './transfers.router.js';
import { TransfersService } from './transfers.service.js';

export function createTransfersModule(
  db: Db,
  requireAdmin: RequestHandler,
) {
  const repository = new TransfersRepository(db);
  const service = new TransfersService(repository);
  const controller = new TransfersController(service);
  return transfersRouter(controller, requireAdmin);
}
