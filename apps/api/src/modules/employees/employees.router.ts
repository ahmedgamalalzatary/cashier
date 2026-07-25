import { Router } from "express";
import { requireRole } from "../../middleware/auth.js";
import type { EmployeesController } from "./employees.controller.js";

export function employeesRouter(controller: EmployeesController) {
  const router = Router();
  router.use(requireRole("admin"));
  router.get("/", controller.list);
  router.post("/", controller.create);
  router.put("/:id", controller.update);
  router.post("/:id/cashier-access", controller.grantCashierAccess);
  router.delete("/:id/cashier-access", controller.revokeCashierAccess);
  router.delete("/:id", controller.deactivate);
  return router;
}
