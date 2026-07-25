import { Router } from "express";
import { requireRole } from "../../middleware/auth.js";
import type { ShiftsController } from "./shifts.controller.js";

export function shiftsRouter(controller: ShiftsController) {
  const router = Router();
  router.get("/current", controller.current);
  router.get("/", controller.list);
  router.post("/open", requireRole("cashier"), controller.open);
  router.post("/:id/close", requireRole("cashier"), controller.close);
  router.post("/:id/admin-close", requireRole("admin"), controller.adminClose);
  router.post("/:id/reopen", requireRole("admin"), controller.reopen);
  router.put("/:id/correction", requireRole("admin"), controller.correct);
  return router;
}
