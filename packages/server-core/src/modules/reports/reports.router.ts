import { Router } from "express";
import type { ReportsController } from "./reports.controller.js";

export function reportsRouter(controller: ReportsController) {
  const router = Router();
  router.get("/dashboard", controller.dashboard);
  router.get("/", controller.report);
  return router;
}
