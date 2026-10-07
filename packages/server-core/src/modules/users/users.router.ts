import { Router } from "express";
import type { UsersController } from "./users.controller.js";

export function usersRouter(controller: UsersController) {
  const router = Router();
  router.get("/", controller.list);
  router.post("/", controller.create);
  router.put("/:id", controller.update);
  return router;
}
