import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import type { Server } from "node:http";
import type { RowDataPacket } from "mysql2/promise";
import { createApp } from "../app.js";
import { closeDb, createDb, syncConfiguredAdmin, type Db } from "@cashier/db";
import {
  createCacheRefreshService,
  refreshActiveBranches,
} from "../modules/external/cache-refresh.module.js";
import { runRefreshLoop } from "../modules/external/worker-loop.js";
import { loadDesktopSettings } from "./settings.js";

export async function verifyDesktopSchema(db: Db, expected: number) {
  if (!Number.isSafeInteger(expected) || expected < 1)
    throw new Error("Desktop migrations manifest is invalid");
  let rows: RowDataPacket[];
  try {
    [rows] = await db.$client.query<RowDataPacket[]>(
      "SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1",
    );
  } catch {
    throw new Error(
      "Local MySQL is unavailable or the database needs migrations. Check settings.env and prepare the database before opening Cashier.",
    );
  }
  if (Number(rows[0]?.created_at) !== expected) {
    throw new Error(
      "Database migrations do not match this Cashier version. Apply the matching database migrations before opening the app.",
    );
  }
}

export async function startDesktopApi(
  settingsFile: string,
  manifestFile: string,
  signal: AbortSignal,
) {
  const { environment, admin, syncEnabled } = loadDesktopSettings(settingsFile);
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8")) as {
    schemaCreatedAt: number;
  };
  const db = createDb(environment.DATABASE_URL);
  let server: Server | undefined;
  let worker = Promise.resolve();
  const workerShutdown = new AbortController();
  const stopWorker = () => workerShutdown.abort();
  signal.addEventListener("abort", stopWorker, { once: true });
  try {
    await verifyDesktopSchema(db, manifest.schemaCreatedAt);
    await syncConfiguredAdmin(db, admin);
    signal.throwIfAborted();
    const app = createApp(db, {
      jwtSecret: environment.JWT_SECRET,
      corsOrigins: environment.CORS_ORIGIN,
      trustProxy: false,
    });
    server = await new Promise<Server>((resolve, reject) => {
      const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
      listener.once("error", reject);
    });
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
        () => refreshActiveBranches(db, refresh, workerShutdown.signal),
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
        await Promise.all([closing, worker]);
        await closeDb(db);
      },
    };
  } catch (error) {
    workerShutdown.abort();
    signal.removeEventListener("abort", stopWorker);
    if (server)
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    await worker;
    await closeDb(db);
    throw error;
  }
}
