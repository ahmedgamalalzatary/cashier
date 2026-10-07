import type { Db } from "@cashier/db";
import { RefundsController } from "./refunds.controller.js";
import { RefundsRepository } from "./refunds.repository.js";
import { refundsRouter } from "./refunds.router.js";
import { RefundsService } from "./refunds.service.js";

export function createRefundsModule(db: Db) {
  const repository = new RefundsRepository(db);
  const service = new RefundsService(repository);
  return refundsRouter(new RefundsController(service));
}
