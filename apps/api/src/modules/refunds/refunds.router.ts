import { Router } from "express";
import type { RefundsController } from "./refunds.controller.js";

export function refundsRouter(controller: RefundsController) {
  const router = Router();
  router.get("/", controller.list);
  router.post("/", controller.create);
  router.get("/order/:orderId/quantities", controller.quantities);
  router.get("/:id", controller.get);
  return router;
}
