import type { Db } from "../../db/index.js";
import { UsersController } from "./users.controller.js";
import { UsersRepository } from "./users.repository.js";
import { usersRouter } from "./users.router.js";
import { UsersService } from "./users.service.js";

export function createUsersModule(db: Db) {
  const repository = new UsersRepository(db);
  const service = new UsersService(repository);
  const controller = new UsersController(service);
  return usersRouter(controller);
}
