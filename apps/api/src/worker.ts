import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { closeDb, createDb } from "@cashier/db";
import { loadRuntimeEnv } from "./env.js";
import { runRefreshLoop } from "./modules/external/worker-loop.js";
import {
  createCacheRefreshService,
  refreshActiveBranches,
} from "./modules/external/cache-refresh.module.js";

const environment = loadRuntimeEnv();
const db = createDb(environment.DATABASE_URL);
const shutdown = new AbortController();
const refresh = createCacheRefreshService(
  db,
  {
    baseUrl: environment.EXTERNAL_ORDERS_BASE_URL,
    phoneNumber: environment.EXTERNAL_ORDERS_PHONE_NUMBER,
    password: environment.EXTERNAL_ORDERS_PASSWORD,
  },
  `${hostname()}:${process.pid}:${randomUUID()}`,
  environment.EXTERNAL_CATALOG_ENABLED,
  shutdown.signal,
);

process.once("SIGTERM", () => {
  shutdown.abort();
});
process.once("SIGINT", () => {
  shutdown.abort();
});

await runRefreshLoop(
  () => refreshActiveBranches(db, refresh, shutdown.signal),
  shutdown.signal,
);
await closeDb(db);
