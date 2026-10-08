import { Router } from "express";
import type { Db } from "@cashier/db";
import { requireRole } from "../../middleware/auth.js";
import { idParam } from "../../middleware/validation.js";
import { BranchesRepository } from "./branches.repository.js";
import { BranchesService } from "./branches.service.js";
import { branchInput, branchUpdateInput } from "./branches.schemas.js";
import { HttpError } from "../../middleware/error.js";

export function createBranchesModule(db: Db, branchId?: string) {
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
  router.post("/", requireRole("admin"), async (req, res) => {
    res.status(201).json(await service.create(branchInput.parse(req.body)));
  });
  router.put("/:id", requireRole("admin"), async (req, res) => {
    res.json(
      await service.update(
        idParam.parse(req.params.id),
        branchUpdateInput.parse(req.body),
      ),
    );
  });
  router.delete("/:id", requireRole("admin"), async (req, res) => {
    res.json(
      await service.update(idParam.parse(req.params.id), { isActive: false }),
    );
  });
  return router;
}
