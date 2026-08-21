import type { Db } from "../../db/index.js";
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
) {
  const backend = new ExternalBackendClient(config);
  return new CacheRefreshService(
    new CacheRefreshRepository(db),
    new ExternalCatalogClient(backend),
    new ProductsRepository(db, false),
    new ExternalOrdersClient(backend),
    new ExternalOrdersRepository(db),
    { now: () => new Date(), owner },
  );
}
