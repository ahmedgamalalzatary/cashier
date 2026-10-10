import { Router } from "express";
import { z } from "zod";
import type { Db } from "@cashier/db";
import { createLoginRateLimiter } from "../auth/login-rate-limit.js";
import { DeviceLinkRepository } from "./device-link.repository.js";
import { DeviceLinkService } from "./device-link.service.js";
import { authenticateDevice } from "../../middleware/device-auth.js";
import { readDeviceAccounts } from "./device-accounts.js";
import { ingestBatch } from "./ingest.js";
import { beginBackupGeneration,completeBackupGeneration } from "./backup-generations.js";

const linkInput = z.object({
  code: z.string().max(64),
  // The branch this PC already holds, when it holds one. Optional, so a PC
  // built before this field existed still links exactly as it used to.
  expectedBranchId: z.string().uuid().optional(),
});

const ingestInput = z.object({
  appVersion: z.string().max(64).optional(),
  migrationCheckpoint: z.number().int().nonnegative(),
  generation:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0),
  rows: z
    .array(
      z.object({
        seq: z.number().int().positive(),
        table: z.string().max(64),
        op: z.enum(["upsert", "delete"]),
        pk: z.record(z.string(), z.unknown()),
        row: z.record(z.string(), z.unknown()).nullable().optional(),
      }),
    )
    .max(500),
});

/**
 * The shop PCs' own endpoints (plan 7.4). Linking needs no admin session: the
 * one-time code is the proof, so wrong codes are limited per address.
 */
export function createDevicesModule(db: Db) {
  const router = Router();
  const service = new DeviceLinkService(new DeviceLinkRepository(db));
  router.post("/backup-generation",authenticateDevice(db),async(req,res)=>{
    const input=z.object({requestId:z.string().uuid(),minimumGeneration:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER-1),replace:z.boolean().default(false),replaceAll:z.boolean().default(false)}).parse(req.body);
    res.json(await beginBackupGeneration(db,req.device!,input.requestId,input.minimumGeneration,input.replace,input.replaceAll));
  });
  router.post("/backup-generation/complete",authenticateDevice(db),async(req,res)=>{
    const input=z.object({generation:z.number().int().positive().max(Number.MAX_SAFE_INTEGER)}).parse(req.body);
    res.json(await completeBackupGeneration(db,req.device!,input.generation));
  });
  router.get("/accounts", authenticateDevice(db), async (req, res) => {
    res.json(await readDeviceAccounts(db, req.device!.branchId));
  });
  router.post(
    "/ingest",
    authenticateDevice(db),
    async (req, res) => {
      const body = ingestInput.parse(req.body);
      res.json(
        await ingestBatch(db, req.device!, {
          migrationCheckpoint: body.migrationCheckpoint,
          generation:body.generation,
          rows: body.rows,
        }),
      );
    },
  );
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
