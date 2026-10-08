import { Router } from "express";
import type { Db } from "@cashier/db";
import { requireSuperAdmin } from "../../middleware/auth.js";
import { LinkCodesRepository } from "./link-codes.repository.js";
import { LinkCodesService } from "./link-codes.service.js";
import { linkCodeInput } from "./link-codes.schemas.js";

/**
 * Only the super-admin mints link codes (plan Phase 8.3). Consuming a code is
 * the desktop app's job in Phase 9, not an authenticated route here.
 */
export function createLinkCodesModule(db: Db) {
  const router = Router();
  const service = new LinkCodesService(new LinkCodesRepository(db));
  router.use(requireSuperAdmin());
  router.post("/", async (req, res) => {
    const { branchId } = linkCodeInput.parse(req.body);
    const result = await service.generate(req.user!, { branchId });
    res.status(201).json({
      code: result.code,
      expiresAt: result.expiresAt.toISOString(),
    });
  });
  return router;
}
