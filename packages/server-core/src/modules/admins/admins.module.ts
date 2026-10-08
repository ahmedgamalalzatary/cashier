import { Router } from "express";
import type { Db } from "@cashier/db";
import { requireSuperAdmin } from "../../middleware/auth.js";
import { idParam } from "../../middleware/validation.js";
import { AdminsRepository } from "./admins.repository.js";
import { AdminsService } from "./admins.service.js";
import {
  adminBranchesInput,
  adminInput,
  adminUpdateInput,
} from "./admins.schemas.js";

/**
 * Admin accounts are managed online only (plan Phase 8.2), so this module never
 * takes a branch: the super-admin sees every account and assigns branches to it.
 */
export function createAdminsModule(db: Db) {
  const router = Router();
  const service = new AdminsService(new AdminsRepository(db));
  router.use(requireSuperAdmin());
  router.get("/", async (req, res) => res.json(await service.list(req.user!)));
  router.post("/", async (req, res) => {
    res
      .status(201)
      .json(await service.create(req.user!, adminInput.parse(req.body)));
  });
  router.put("/:id", async (req, res) => {
    await service.update(
      req.user!,
      idParam.parse(req.params.id),
      adminUpdateInput.parse(req.body),
    );
    res.json({ ok: true });
  });
  router.put("/:id/branches", async (req, res) => {
    const { branchIds } = adminBranchesInput.parse(req.body);
    await service.assignBranches(
      req.user!,
      idParam.parse(req.params.id),
      branchIds,
    );
    res.json({ ok: true });
  });
  return router;
}
