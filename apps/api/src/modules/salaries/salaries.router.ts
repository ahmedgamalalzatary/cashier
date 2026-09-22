import { Router } from "express";
import type { SalariesController } from "./salaries.controller.js";
export function salariesRouter(controller: SalariesController) {
  const router = Router();
  router.get("/", controller.month);
  router.post("/advances", controller.advance);
  router.post("/adjustments", controller.adjustment);
  router.post("/payments", controller.pay);
  return router;
}
