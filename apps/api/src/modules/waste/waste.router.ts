import { Router } from "express";
import type { WasteController } from "./waste.controller.js";

export function wasteRouter(controller: WasteController) {
  const router = Router();
  router.get("/catalog", controller.catalog);
  router.get("/", controller.list);
  router.post("/", controller.create);
  router.get("/:id", controller.get);
  return router;
}
