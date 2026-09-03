import type { Db } from "../../db/index.js";
import { ReportsController } from "./reports.controller.js";
import { ReportsRepository } from "./reports.repository.js";
import { reportsRouter } from "./reports.router.js";
import { ReportsService } from "./reports.service.js";
export function createReportsModule(db: Db) {
  return reportsRouter(
    new ReportsController(new ReportsService(new ReportsRepository(db))),
  );
}
