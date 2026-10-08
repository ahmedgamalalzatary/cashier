import { Router } from "express";
import { authenticate } from "../../middleware/auth.js";
import type { Db } from "@cashier/db";
import type { Access } from "../../access.js";
import type { AuthController } from "./auth.controller.js";
import { createLoginRateLimiter } from "./login-rate-limit.js";

export function authRouter(
  controller: AuthController,
  db: Db,
  jwtSecret: string,
  access?: Access,
) {
  const router = Router();
  router.post("/login", createLoginRateLimiter(), controller.login);
  router.post("/logout", controller.logout);
  router.get("/me", authenticate(db, jwtSecret, access), controller.me);
  return router;
}
