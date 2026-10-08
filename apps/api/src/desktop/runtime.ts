import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import type { Server } from "node:http";
import { createApp } from "../app.js";
import {
  branches,
  closeDb,
  createDb,
  syncConfiguredAdmin,
  type Db,
} from "@cashier/db";
import {
  createCacheRefreshService,
  refreshActiveBranches,
} from "../modules/external/cache-refresh.module.js";
import { runRefreshLoop } from "../modules/external/worker-loop.js";
import { loadDesktopSettings } from "./settings.js";
import { prepareDesktopDatabase } from "./upgrade.js";
import { runAutoCloseLoop } from "../modules/shifts/auto-close.js";

/** Where the desktop shell keeps the bundled MySQL tools and shared data. */
export type DesktopTools = {
  mysqlBin: string;
  dataDir: string;
  /** Called before a slow database update starts. */
  onBusy?: () => void;
};

type Manifest = { version: string; schemaCreatedAt: number };

export function readDesktopManifest(manifestFile: string): Manifest {
  const manifest = JSON.parse(
    fs.readFileSync(manifestFile, "utf8"),
  ) as Manifest;
  if (!Number.isSafeInteger(manifest.schemaCreatedAt))
    throw new Error("Desktop migrations manifest is invalid");
  return manifest;
}

/** Brings the database to this app's version (backup first when it changes). */
export function prepareForApp(
  db: Db,
  databaseUrl: string,
  manifestFile: string,
  manifest: Manifest,
  tools: DesktopTools,
) {
  return prepareDesktopDatabase({
    db,
    databaseUrl,
    mysqlBin: tools.mysqlBin,
    dataDir: tools.dataDir,
    migrationsFolder: path.join(path.dirname(manifestFile), "migrations"),
    expected: manifest.schemaCreatedAt,
    appVersion: manifest.version,
    onBusy: tools.onBusy,
  });
}

export async function startDesktopApi(
  settingsFile: string,
  manifestFile: string,
  signal: AbortSignal,
  databaseUrl: string,
  tools: DesktopTools = { mysqlBin: "", dataDir: process.cwd() },
) {
  const { environment, admin, syncEnabled, branchId } = loadDesktopSettings(
    settingsFile,
    databaseUrl,
  );
  const manifest = readDesktopManifest(manifestFile);
  const db = createDb(environment.DATABASE_URL);
  let server: Server | undefined;
  let worker = Promise.resolve();
  let shiftWorker = Promise.resolve();
  const workerShutdown = new AbortController();
  const stopWorker = () => workerShutdown.abort();
  signal.addEventListener("abort", stopWorker, { once: true });
  try {
    await prepareForApp(
      db,
      environment.DATABASE_URL,
      manifestFile,
      manifest,
      tools,
    );
    const localBranches = await db.select({ id: branches.id }).from(branches);
    if (localBranches.length !== 1 || localBranches[0].id !== branchId)
      throw new Error(
        "Desktop database must contain only the configured BRANCH_ID",
      );
    await syncConfiguredAdmin(db, admin);
    signal.throwIfAborted();
    const app = createApp(db, {
      jwtSecret: environment.JWT_SECRET,
      corsOrigins: environment.CORS_ORIGIN,
      trustProxy: false,
      branchId,
    });
    server = await new Promise<Server>((resolve, reject) => {
      const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
      listener.once("error", reject);
    });
    shiftWorker = runAutoCloseLoop(db, workerShutdown.signal);
    if (syncEnabled) {
      const refresh = createCacheRefreshService(
        db,
        {
          baseUrl: environment.EXTERNAL_ORDERS_BASE_URL,
          phoneNumber: environment.EXTERNAL_ORDERS_PHONE_NUMBER,
          password: environment.EXTERNAL_ORDERS_PASSWORD,
        },
        `${hostname()}:${process.pid}:${randomUUID()}`,
        environment.EXTERNAL_CATALOG_ENABLED,
        workerShutdown.signal,
      );
      worker = runRefreshLoop(
        () =>
          refreshActiveBranches(
            db,
            refresh,
            workerShutdown.signal,
            undefined,
            branchId,
          ),
        workerShutdown.signal,
      );
    }
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Desktop API did not bind a local port");
    let stopped = false;
    return {
      apiUrl: `http://127.0.0.1:${address.port}`,
      close: async () => {
        if (stopped) return;
        stopped = true;
        workerShutdown.abort();
        signal.removeEventListener("abort", stopWorker);
        const closing = new Promise<void>((resolve) =>
          server!.close(() => resolve()),
        );
        await Promise.all([closing, worker, shiftWorker]);
        await closeDb(db);
      },
    };
  } catch (error) {
    workerShutdown.abort();
    signal.removeEventListener("abort", stopWorker);
    if (server)
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    await Promise.all([worker, shiftWorker]);
    await closeDb(db);
    throw error;
  }
}
