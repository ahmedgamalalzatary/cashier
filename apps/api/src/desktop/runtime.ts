import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import type { Server } from "node:http";
import { createApp } from "../app.js";
import { branches, closeDb, createDb, type Db } from "@cashier/db";
import {
  createCacheRefreshService,
  refreshActiveBranches,
} from "../modules/external/cache-refresh.module.js";
import { runRefreshLoop } from "../modules/external/worker-loop.js";
import { loadDesktopSettings } from "./settings.js";
import { prepareDesktopDatabase } from "./upgrade.js";
import { runAutoCloseLoop } from "../modules/shifts/auto-close.js";
import {
  applyDeviceAccounts,
  requestDeviceAccounts,
  runAccountsLoop,
} from "./accounts.js";
import {
  migrationCheckpoint,
  runUploadLoop,
  UnlinkedError,
} from "./upload.js";

import {createBackupClient} from "./backup-client.js";

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
  /** Called once when online reports this PC is no longer linked. */
  reportUnlinked: (reason: string) => void = reason=>console.error(reason),
) {
  const { environment, deviceToken, onlineApiUrl, syncEnabled, branchId } =
    loadDesktopSettings(settingsFile, databaseUrl);
  const manifest = readDesktopManifest(manifestFile);
  const db = createDb(environment.DATABASE_URL);
  let server: Server | undefined;
  let worker = Promise.resolve();
  let shiftWorker = Promise.resolve();
  let accountsWorker = Promise.resolve();
  let uploadWorker = Promise.resolve();
  const workerShutdown = new AbortController();
  const backupShutdown = new AbortController();
  const stopWorker = () => {workerShutdown.abort();backupShutdown.abort();};
  let unlinkedReported=false;
  const onUnlinked=(reason:string)=>{
    if(unlinkedReported) return;
    unlinkedReported=true;
    backupShutdown.abort();
    reportUnlinked(reason);
  };
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
    signal.throwIfAborted();
    // Backup to online every 15 minutes plus the admin's button (plan D10).
    // Failures are logged and retried; they never block selling.
    const uploadOptions = {
      apiUrl: onlineApiUrl,
      deviceToken,
      appVersion: manifest.version,
      migrationCheckpoint: await migrationCheckpoint(db),
      signal: backupShutdown.signal,
    };
    const backup=createBackupClient(db,path.dirname(settingsFile),uploadOptions,onUnlinked);
    const runUpload=()=>backup.uploadNow();
    const app = createApp(db, {
      jwtSecret: environment.JWT_SECRET,
      corsOrigins: environment.CORS_ORIGIN,
      trustProxy: false,
      branchId,
      uploadNow: runUpload,
      resendAll: backup.resendAll,
    });
    server = await new Promise<Server>((resolve, reject) => {
      const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
      listener.once("error", reject);
    });
    shiftWorker = runAutoCloseLoop(db, workerShutdown.signal);
    // Capture and generation requests start only after the local listener is
    // available. Revocation stops backup work, never shift/catalog maintenance.
    uploadWorker=runUploadLoop(runUpload,backupShutdown.signal,error=>{
      if(error instanceof UnlinkedError){onUnlinked(error.message);return;}
      console.error(error instanceof Error?error.message:"Backup upload failed; the data stays queued.");
    });
    // Network availability never gates serving the local cache. A freshly
    // linked PC receives its first admin accounts as this first pull completes.
    accountsWorker = runAccountsLoop(async () => {
      const snapshot = await requestDeviceAccounts({
        apiUrl: onlineApiUrl,
        branchId,
        deviceToken,
        appVersion: manifest.version,
        signal: workerShutdown.signal,
      });
      workerShutdown.signal.throwIfAborted();
      await applyDeviceAccounts(db, branchId, snapshot);
    }, workerShutdown.signal);
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
        stopWorker();
        signal.removeEventListener("abort", stopWorker);
        const closing = new Promise<void>((resolve) =>
          server!.close(() => resolve()),
        );
        await Promise.all([
          closing,
          worker,
          shiftWorker,
          accountsWorker,
          uploadWorker,
        ]);
        await closeDb(db);
      },
    };
  } catch (error) {
    stopWorker();
    signal.removeEventListener("abort", stopWorker);
    if (server)
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    await Promise.all([worker, shiftWorker, accountsWorker, uploadWorker]);
    await closeDb(db);
    throw error;
  }
}
