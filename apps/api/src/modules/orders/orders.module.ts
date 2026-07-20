import type { Db } from "../../db/index.js";
import { OrdersController } from "./orders.controller.js";
import { OrdersRepository } from "./orders.repository.js";
import { ordersRouter } from "./orders.router.js";
import { OrdersService } from "./orders.service.js";

export function createOrdersModule(db: Db) {
  const repository = new OrdersRepository(db);
  const service = new OrdersService(repository);
  const controller = new OrdersController(service);
  return ordersRouter(controller);
}
