import { Router } from "express";
import { z } from "zod";
import type { Db } from "@cashier/db";
import { createLoginRateLimiter } from "../auth/login-rate-limit.js";
import { DeviceLinkRepository } from "./device-link.repository.js";
import { DeviceLinkService } from "./device-link.service.js";
import { authenticateDevice } from "../../middleware/device-auth.js";
import { readDeviceAccounts } from "./device-accounts.js";

const linkInput = z.object({
  code: z.string().max(64),
  // The branch this PC already holds, when it holds one. Optional, so a PC
  // built before this field existed still links exactly as it used to.
  expectedBranchId: z.string().uuid().optional(),
});

/**
 * The shop PCs' own endpoints (plan 7.4). Linking needs no admin session: the
 * one-time code is the proof, so wrong codes are limited per address.
 */
export function createDevicesModule(db: Db) {
  const router = Router();
  const service = new DeviceLinkService(new DeviceLinkRepository(db));
  router.get("/accounts", authenticateDevice(db), async (req, res) => {
    res.json(await readDeviceAccounts(db, req.device!.branchId));
  });
  router.post(
    "/link",
    createLoginRateLimiter({ identity: () => "device-link" }),
    async (req, res) => {
      const { code, expectedBranchId } = linkInput.parse(req.body);
      // Recorded for support only; a PC without it still links.
      res
        .status(201)
        .json(
          await service.link(
            code,
            req.get("X-Cashier-Version") ?? undefined,
            expectedBranchId,
          ),
        );
    },
  );
  return router;
}
