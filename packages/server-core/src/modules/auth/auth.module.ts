import type { Db } from "@cashier/db";
import type { Access } from "../../access.js";
import { AuthRepository } from "./auth.repository.js";
import { AuthService } from "./auth.service.js";
import { AuthController } from "./auth.controller.js";
import { authRouter } from "./auth.router.js";

export function createAuthModule(db: Db, jwtSecret: string, access?: Access) {
  const repository = new AuthRepository(db);
  const service = new AuthService(
    repository,
    jwtSecret,
    undefined,
    access,
  );
  const controller = new AuthController(service);
  return authRouter(controller, db, jwtSecret, access);
}
