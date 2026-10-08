import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import type { Db } from "@cashier/db";
import { devices } from "@cashier/db";
import { HttpError } from "./error.js";
import { hashDeviceToken } from "../modules/devices/device-link.service.js";

export type AuthDevice = { id: string; branchId: string };

declare global {
  // Express request fields are extended globally by the framework's type definitions.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      device?: AuthDevice;
    }
  }
}

const UNLINKED = "هذا الجهاز غير مربوط أو أُلغي ربطه";

/**
 * Signs in a linked shop PC by its device token (`Authorization: Device <token>`,
 * plan 7.4). A token replaced by a newer link is gone, so that PC gets 401.
 * Every call records when the PC was last seen and, when it says, its version.
 */
export function authenticateDevice(db: Db) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    const token = header?.startsWith("Device ") ? header.slice(7).trim() : "";
    if (!token) throw new HttpError(401, UNLINKED);
    const [device] = await db
      .select({ id: devices.id, branchId: devices.branchId })
      .from(devices)
      .where(eq(devices.tokenHash, hashDeviceToken(token)))
      .limit(1);
    if (!device) throw new HttpError(401, UNLINKED);
    const version = req.get("X-Cashier-Version")?.trim().slice(0, 64);
    await db
      .update(devices)
      .set({ lastSeenAt: new Date(), ...(version ? { appVersion: version } : {}) })
      .where(eq(devices.id, device.id));
    req.device = device;
    next();
  };
}
