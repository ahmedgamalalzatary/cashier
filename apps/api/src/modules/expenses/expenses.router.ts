import { Router } from "express";
import type { RequestHandler } from "express";
import type { ExpensesController } from "./expenses.controller.js";

export function expensesRouter(
  controller: ExpensesController,
  adminOnly: RequestHandler,
) {
  const router = Router();
  router.get("/categories", controller.categories);
  router.post("/categories", adminOnly, controller.createCategory);
  router.patch("/categories/:id", adminOnly, controller.updateCategory);
  router.get("/", controller.list);
  router.post("/", controller.create);
  return router;
}
