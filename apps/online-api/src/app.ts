import express from "express";
import cors from "cors";
import type { Db } from "@cashier/db";
import {
  authenticate,
  createAuthModule,
  createBranchesListModule,
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

// Online serves every branch and refuses cashiers outright (plan D4). It also
// mounts no business write route: management arrives in Phase 8.
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
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/auth", createAuthModule(db, jwtSecret, onlineAccess));
  app.use(
    "/api/branches",
    authenticate(db, jwtSecret, onlineAccess),
    createBranchesListModule(db),
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