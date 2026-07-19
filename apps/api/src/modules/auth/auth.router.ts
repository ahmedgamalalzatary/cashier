import { Router } from "express";
import { authenticate } from "../../middleware/auth.js";
import type { Db } from "../../db/index.js";
import type { AuthController } from "./auth.controller.js";
import { createLoginRateLimiter } from "./login-rate-limit.js";

export function authRouter(
  controller: AuthController,
  db: Db,
  jwtSecret: string,
) {
  const router = Router();
  router.post("/login", createLoginRateLimiter(), controller.login);
  router.get("/me", authenticate(db, jwtSecret), controller.me);
  const passwordRateLimiter = createLoginRateLimiter({
    identity: (req) => String(req.user!.id),
  });
  router.put(
    "/password",
    authenticate(db, jwtSecret),
    passwordRateLimiter,
    controller.changePassword,
  );
  return router;
}
