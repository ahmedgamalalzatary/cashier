import { Router } from "express";
import { requireRole } from "../../middleware/auth.js";
import type { ReportsController } from "./reports.controller.js";

export function reportsRouter(controller: ReportsController) {
  const router = Router();
  router.use(requireRole("admin"));
  router.get("/dashboard", controller.dashboard);
  router.get("/", controller.report);
  return router;
}
