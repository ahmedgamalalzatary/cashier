import type { Db } from '@cashier/db';
import { InvoiceJourneyRepository } from './invoice-journey.repository.js';
import { InvoiceJourneyService } from './invoice-journey.service.js';
import { PurchasesController } from './purchases.controller.js';
import { PurchasesRepository } from './purchases.repository.js';
import { purchasesRouter } from './purchases.router.js';
import { PurchasesService } from './purchases.service.js';

export function createPurchasesModule(db: Db) {
  const repository = new PurchasesRepository(db);
  const service = new PurchasesService(repository);
  const controller = new PurchasesController(
    service,
    new InvoiceJourneyService(repository, new InvoiceJourneyRepository(db)),
  );
  return purchasesRouter(controller);
}
