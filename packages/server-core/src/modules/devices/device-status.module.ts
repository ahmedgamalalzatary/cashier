import { Router } from "express";
import { asc } from "drizzle-orm";
import type { Db } from "@cashier/db";
import { devices } from "@cashier/db";
import type { DeviceStatus } from "@cashier/shared";
import { requireSuperAdmin } from "../../middleware/auth.js";

/**
 * The super-admin's view of the shop PCs: which desktop version each linked PC
 * last reported, when it last contacted online and when its last backup
 * arrived. It shows which versions still need support (see the desktop README).
 */
export function createDeviceStatusModule(db: Db) {
  const router = Router();
  router.use(requireSuperAdmin());
  router.get("/", async (_req, res) => {
    const rows = await db
      .select({
        branchId: devices.branchId,
        appVersion: devices.appVersion,
        linkedAt: devices.linkedAt,
        lastSeenAt: devices.lastSeenAt,
        lastUploadAt: devices.lastUploadAt,
      })
      .from(devices)
      .orderBy(asc(devices.branchId));
    res.json(
      rows.map(
        (row): DeviceStatus => ({
          branchId: row.branchId,
          appVersion: row.appVersion,
          linkedAt: row.linkedAt.toISOString(),
          lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
          lastUploadAt: row.lastUploadAt?.toISOString() ?? null,
        }),
      ),
    );
  });
  return router;
}
