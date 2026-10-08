import { Router, type RequestHandler } from "express";
import type { Db } from "@cashier/db";
import { requireRole, requireSuperAdmin } from "../../middleware/auth.js";
import { idParam } from "../../middleware/validation.js";
import { BranchesRepository } from "./branches.repository.js";
import { BranchesService } from "./branches.service.js";
import { branchInput, branchUpdateInput } from "./branches.schemas.js";
import { HttpError } from "../../middleware/error.js";

function branchesRouter(
  db: Db,
  canWrite: RequestHandler,
  branchId?: string,
) {
  const router = Router();
  const service = new BranchesService(new BranchesRepository(db));
  router.use((req, _res, next) => {
    if (branchId && req.method !== "GET")
      throw new HttpError(403, "إدارة الفروع متاحة عبر الإنترنت فقط");
    next();
  });
  router.get("/", async (req, res) =>
    res.json(await service.list(req.user!, branchId)),
  );
  router.post("/", canWrite, async (req, res) => {
    res.status(201).json(await service.create(branchInput.parse(req.body)));
  });
  router.put("/:id", canWrite, async (req, res) => {
    res.json(
      await service.update(
        idParam.parse(req.params.id),
        branchUpdateInput.parse(req.body),
      ),
    );
  });
  router.delete("/:id", canWrite, async (req, res) => {
    res.json(
      await service.update(idParam.parse(req.params.id), { isActive: false }),
    );
  });
  return router;
}

/**
 * Online branch management (plan Phase 8.1). Every signed-in admin still reads
 * the list for the branch picker, but only the super-admin writes.
 */
export function createBranchesManagementModule(db: Db) {
  return branchesRouter(db, requireSuperAdmin());
}

export function createBranchesModule(db: Db, branchId?: string) {
  return branchesRouter(db, requireRole("admin"), branchId);
}