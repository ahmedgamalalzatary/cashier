import { Router } from "express";
import { z } from "zod";
import type { Db } from "@cashier/db";
import { createLoginRateLimiter } from "../auth/login-rate-limit.js";
import { DeviceLinkRepository } from "./device-link.repository.js";
import { DeviceLinkService } from "./device-link.service.js";

const linkInput = z.object({ code: z.string().max(64) });

/**
 * The shop PCs' own endpoints (plan 7.4). Linking needs no admin session: the
 * one-time code is the proof, so wrong codes are limited per address.
 */
export function createDevicesModule(db: Db) {
  const router = Router();
  const service = new DeviceLinkService(new DeviceLinkRepository(db));
  router.post(
    "/link",
    createLoginRateLimiter({ identity: () => "device-link" }),
    async (req, res) => {
      const { code } = linkInput.parse(req.body);
      res.status(201).json(await service.link(code));
    },
  );
  return router;
}
