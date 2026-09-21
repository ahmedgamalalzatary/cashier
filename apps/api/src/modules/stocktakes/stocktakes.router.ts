import { Router } from "express";
import type { StocktakesController } from "./stocktakes.controller.js";
export function stocktakesRouter(controller: StocktakesController) {
  const router = Router();
  router.get("/", controller.list);
  router.post("/", controller.start);
  router.post("/manual-adjustments", controller.manual);
  router.get("/:id", controller.find);
  router.put("/:id/counts", controller.counts);
  router.post("/:id/confirm", controller.confirm);
  return router;
}
