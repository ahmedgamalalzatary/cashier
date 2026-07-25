import type { Db } from "../../db/index.js";
import { EmployeesController } from "./employees.controller.js";
import { EmployeesRepository } from "./employees.repository.js";
import { employeesRouter } from "./employees.router.js";
import { EmployeesService } from "./employees.service.js";

export function createEmployeesModule(db: Db) {
  const repository = new EmployeesRepository(db);
  const service = new EmployeesService(repository);
  const controller = new EmployeesController(service);
  return employeesRouter(controller);
}
