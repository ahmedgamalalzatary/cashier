import type { Db } from "../../db/index.js";
import { WasteController } from "./waste.controller.js";
import { WasteRepository } from "./waste.repository.js";
import { wasteRouter } from "./waste.router.js";
import { WasteService } from "./waste.service.js";

export function createWasteModule(db: Db) {
  const service = new WasteService(new WasteRepository(db));
  return wasteRouter(new WasteController(service));
}
