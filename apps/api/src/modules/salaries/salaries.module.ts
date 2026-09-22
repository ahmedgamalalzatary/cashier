import type { Db } from "../../db/index.js";
import { SalariesController } from "./salaries.controller.js";
import { SalariesRepository } from "./salaries.repository.js";
import { salariesRouter } from "./salaries.router.js";
import { SalariesService } from "./salaries.service.js";
export function createSalariesModule(db: Db) {
  const repo = new SalariesRepository(db);
  return salariesRouter(new SalariesController(new SalariesService(repo)));
}
