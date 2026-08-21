import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { closeDb, createDb } from "./db/index.js";
import { loadRuntimeEnv } from "./env.js";
import { createCacheRefreshService } from "./modules/external/cache-refresh.module.js";

const environment = loadRuntimeEnv();
const db = createDb(environment.DATABASE_URL);
const refresh = createCacheRefreshService(
  db,
  {
    baseUrl: environment.EXTERNAL_ORDERS_BASE_URL,
    phoneNumber: environment.EXTERNAL_ORDERS_PHONE_NUMBER,
    password: environment.EXTERNAL_ORDERS_PASSWORD,
  },
  `${hostname()}:${process.pid}:${randomUUID()}`,
);

const shutdown = new AbortController();
process.once("SIGTERM", () => {
  shutdown.abort();
});
process.once("SIGINT", () => {
  shutdown.abort();
});

while (!shutdown.signal.aborted) {
  try {
    await refresh.runDue(shutdown.signal);
  } catch (error) {
    console.error("Cache refresh failed", error);
  }
  if (!shutdown.signal.aborted) {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 5_000);
      shutdown.signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  }
}
await closeDb(db);
