import type { Db } from "../../db/index.js";
import { ShiftsController } from "./shifts.controller.js";
import { ShiftsRepository } from "./shifts.repository.js";
import { shiftsRouter } from "./shifts.router.js";
import { ShiftsService } from "./shifts.service.js";

export function createShiftsModule(db: Db) {
  const repository = new ShiftsRepository(db);
  const service = new ShiftsService(repository);
  const controller = new ShiftsController(service);
  return shiftsRouter(controller);
}
