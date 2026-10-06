import type { Db } from "../../db/index.js";
import { eq } from "drizzle-orm";
import { branches } from "../../db/schema.js";
import { withBranch } from "../../db/branch-context.js";
import {
  ExternalOrdersClient,
  type ExternalOrdersConfig,
} from "../orders/external-orders.client.js";
import { ExternalOrdersRepository } from "../orders/external-orders.repository.js";
import { ProductsRepository } from "../products/products.repository.js";
import { ExternalBackendClient } from "./external-backend.client.js";
import { CacheRefreshRepository } from "./cache-refresh.repository.js";
import { CacheRefreshService } from "./cache-refresh.service.js";
import { ExternalCatalogClient } from "./external-catalog.client.js";

export function createCacheRefreshService(
  db: Db,
  config: ExternalOrdersConfig,
  owner: string,
  syncCatalog = true,
) {
  const backend = new ExternalBackendClient(config);
  return new CacheRefreshService(
    new CacheRefreshRepository(db),
    new ExternalCatalogClient(backend),
    new ProductsRepository(db, false),
    new ExternalOrdersClient(backend),
    new ExternalOrdersRepository(db),
    { now: () => new Date(), owner, syncCatalog },
  );
}

export async function refreshActiveBranches(
  db: Db,
  refresh: Pick<CacheRefreshService, "runDue">,
  signal?: AbortSignal,
  onError: (branchId: number, error: unknown) => void = (id, error) =>
    console.error(`Cache refresh failed for branch ${id}`, error),
) {
  const active = await db
    .select({ id: branches.id })
    .from(branches)
    .where(eq(branches.isActive, true))
    .orderBy(branches.id);
  // A refresh service holds one lease connection; finish each workspace before
  // moving to the next. A failed workspace does not stop the remaining ones.
  for (const branch of active) {
    signal?.throwIfAborted();
    try {
      await withBranch(branch.id, () => refresh.runDue(signal));
    } catch (error) {
      if (signal?.aborted) throw error;
      onError(branch.id, error);
    }
  }
}
