import { Router } from "express";
import { requireRole } from "../../middleware/auth.js";
import type { OrdersController } from "./orders.controller.js";

export function ordersRouter(controller: OrdersController) {
  const router = Router();
  router.get("/catalog", controller.catalog);
  router.get("/external", controller.externalList);
  router.get("/", controller.list);
  router.post("/", requireRole("cashier"), controller.create);
  router.get("/:id", controller.get);
  return router;
}
