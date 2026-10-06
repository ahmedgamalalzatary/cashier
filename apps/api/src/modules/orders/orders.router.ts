import { Router } from "express";
import type { OrdersController } from "./orders.controller.js";

export function ordersRouter(controller: OrdersController) {
  const router = Router();
  router.get("/external", controller.externalList);
  router.get("/", controller.list);
  router.post("/", controller.create);
  router.get("/:id", controller.get);
  return router;
}
