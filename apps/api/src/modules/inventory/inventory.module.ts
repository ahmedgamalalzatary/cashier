import type { Db } from "../../db/index.js";
import type { RequestHandler } from "express";
import { InventoryController } from "./inventory.controller.js";
import { InventoryRepository } from "./inventory.repository.js";
import { inventoryRouter } from "./inventory.router.js";
import { InventoryService } from "./inventory.service.js";

export function createInventoryModule(db: Db, requireAdmin: RequestHandler) {
  const repository = new InventoryRepository(db);
  const service = new InventoryService(repository);
  const controller = new InventoryController(service);
  return inventoryRouter(controller, requireAdmin);
}
