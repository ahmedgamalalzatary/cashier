import { Router } from "express";
import type { RequestHandler } from "express";
import type { InventoryController } from "./inventory.controller.js";

export function inventoryRouter(
  controller: InventoryController,
  requireAdmin: RequestHandler,
) {
  const router = Router();
  router.get("/main/stock", requireAdmin, controller.stock("main"));
  router.get("/cafe/stock", controller.stock("cafe"));
  return router;
}
