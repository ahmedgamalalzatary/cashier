import type { RequestHandler } from "express";
import type { Db } from "../../db/index.js";
import { ExpensesController } from "./expenses.controller.js";
import { ExpensesRepository } from "./expenses.repository.js";
import { expensesRouter } from "./expenses.router.js";
import { ExpensesService } from "./expenses.service.js";

export function createExpensesModule(db: Db, adminOnly: RequestHandler) {
  return expensesRouter(
    new ExpensesController(new ExpensesService(new ExpensesRepository(db))),
    adminOnly,
  );
}
