import type { Db } from "@cashier/db";
import type { ExternalCatalog } from "../external/external-catalog.client.js";
import type { ProductStockSetupInput } from "./products.schemas.js";
import type { ProductsRepositoryContract } from "./products.service.js";
import { getCatalog, getLocalCatalog } from "./products.catalog.repository.js";
import {
  applyCatalog,
  recordSyncFailure,
} from "./products.catalog-sync.repository.js";
import {
  getStockTargets,
  saveStockSetup,
} from "./products.stock-setup.repository.js";

export class ProductsRepository implements ProductsRepositoryContract {
  constructor(
    private readonly db: Db,
    private readonly recordCatalogSuccess = true,
  ) {}

  getLocalCatalog() {
    return getLocalCatalog(this.db);
  }

  applyCatalog(catalog: ExternalCatalog): Promise<void> {
    return applyCatalog(this.db, this.recordCatalogSuccess, catalog);
  }

  recordSyncFailure(message: string) {
    return recordSyncFailure(this.db, message);
  }

  getCatalog() {
    return getCatalog(this.db);
  }

  getStockTargets(externalProductId: number) {
    return getStockTargets(this.db, externalProductId);
  }

  saveStockSetup(
    externalProductId: number,
    data: ProductStockSetupInput,
  ): Promise<void> {
    return saveStockSetup(this.db, externalProductId, data);
  }
}
