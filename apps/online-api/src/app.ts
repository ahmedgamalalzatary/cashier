import express from "express";
import cors from "cors";
import type { Db } from "@cashier/db";
import {
  authenticate,
  createAdminsModule,
  createDeviceStatusModule,
  createLinkCodesModule,
  createAuthModule,
  createDevicesModule,
  createBranchesManagementModule,
  createReportsModule,
  errorHandler,
  requireRole,
  selectBranch,
} from "@cashier/server-core";

export type AppOptions = {
  jwtSecret: string;
  corsOrigins: string[];
  trustProxy?: boolean;
};

// Online serves every branch and refuses cashiers outright (plan D4). The only
// writes it accepts are super-admin management (plan Phase 8); no business
// write route is ever mounted here.
const onlineAccess = { online: true } as const;

export function createApp(
  db: Db,
  { jwtSecret, corsOrigins, trustProxy = false }: AppOptions,
) {
  const app = express();
  app.set("trust proxy", trustProxy ? 1 : false);
  app.use(
    cors({
      origin: (origin, callback) =>
        callback(null, !origin || corsOrigins.includes(origin)),
      credentials: true,
    }),
  );
  // The capture route carries whole business rows, so it gets the agreed 2 MB
  // ceiling instead of Express's 100 KB default, which rejected normal batches
  // and left the uploader retrying the same oversized request forever. Every
  // other route keeps the default.
  app.use(
    "/api/device/ingest",
    express.json({ limit: "2mb" }),
  );
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/auth", createAuthModule(db, jwtSecret, onlineAccess));
  // Shop PCs sign in with their device token, never an admin session.
  app.use("/api/device", createDevicesModule(db));
  app.use(
    "/api/branches",
    authenticate(db, jwtSecret, onlineAccess),
    createBranchesManagementModule(db),
  );
  app.use(
    "/api/admins",
    authenticate(db, jwtSecret, onlineAccess),
    createAdminsModule(db),
  );
  app.use(
    "/api/devices",
    authenticate(db, jwtSecret, onlineAccess),
    createDeviceStatusModule(db),
  );
  app.use(
    "/api/link-codes",
    authenticate(db, jwtSecret, onlineAccess),
    createLinkCodesModule(db),
  );
  app.use(
    "/api/reports",
    authenticate(db, jwtSecret, onlineAccess),
    selectBranch(db),
    requireRole("admin"),
    createReportsModule(db),
  );

  app.use(errorHandler);
  return app;
}
