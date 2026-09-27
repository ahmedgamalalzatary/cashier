import { Router } from "express";
import type { Db } from "../../db/index.js";
import { requireRole } from "../../middleware/auth.js";
import { idParam } from "../../middleware/validation.js";
import { BranchesRepository } from "./branches.repository.js";
import { BranchesService } from "./branches.service.js";
import { branchInput, branchUpdateInput } from "./branches.schemas.js";

export function createBranchesModule(db: Db) {
  const router = Router();
  const service = new BranchesService(new BranchesRepository(db));
  router.get("/", async (req, res) => res.json(await service.list(req.user!)));
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
