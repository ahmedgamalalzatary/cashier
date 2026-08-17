import type { Db } from "../../db/index.js";
import { OrdersController } from "./orders.controller.js";
import { OrdersRepository } from "./orders.repository.js";
import { ordersRouter } from "./orders.router.js";
import { OrdersService } from "./orders.service.js";
import type { ExternalOrdersClient } from "./external-orders.client.js";

export function createOrdersModule(
  db: Db,
  externalOrders: ExternalOrdersClient,
) {
  const repository = new OrdersRepository(db);
  const service = new OrdersService(repository);
  const controller = new OrdersController(service, externalOrders);
  return ordersRouter(controller);
}
