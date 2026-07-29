import { Router } from "express";
import { requireRole } from "../../middleware/auth.js";
import type { RefundsController } from "./refunds.controller.js";

export function refundsRouter(controller: RefundsController) {
  const router = Router();
  router.get("/", controller.list);
  router.post("/", requireRole("cashier"), controller.create);
  router.get("/order/:orderId/quantities", controller.quantities);
  router.get("/:id", controller.get);
  return router;
}
