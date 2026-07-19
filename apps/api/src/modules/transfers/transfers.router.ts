import { Router, type RequestHandler } from 'express';
import type { TransfersController } from './transfers.controller.js';

export function transfersRouter(
  controller: TransfersController,
  requireAdmin: RequestHandler,
) {
  const router = Router();
  router.get('/requests', controller.listRequests);
  router.post('/requests', controller.createRequest);
  router.get('/requests/:id', controller.getRequest);
  router.post('/requests/:id/approve', requireAdmin, controller.approveRequest);
  router.post('/requests/:id/reject', requireAdmin, controller.rejectRequest);
  router.get('/', controller.listTransfers);
  router.post('/direct', requireAdmin, controller.createDirect);
  router.get('/:id', controller.getTransfer);
  return router;
}
