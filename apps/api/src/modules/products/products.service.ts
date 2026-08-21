import { HttpError } from "../../middleware/error.js";
import type { ExternalCatalog } from "../external/external-catalog.client.js";
import type { ProductStockSetupInput } from "./products.schemas.js";

type CachedCatalog = {
  categories: unknown[];
  products: unknown[];
  lastSuccessfulSyncAt: Date;
};

export type ProductsRepositoryContract = {
  applyCatalog(catalog: ExternalCatalog): Promise<void>;
  recordSyncFailure(message: string): Promise<void>;
  getCatalog(): Promise<CachedCatalog | null>;
  getStockTargets(externalProductId: number): Promise<{
    exists: boolean;
    sizeIds: number[];
    modifierOptionIds: number[];
  }>;
  saveStockSetup(
    externalProductId: number,
    data: ProductStockSetupInput,
  ): Promise<void>;
};

export type ExternalCatalogContract = {
  load(): Promise<ExternalCatalog>;
};

export class ProductsService {
  private syncPromise: Promise<void> | null = null;
  private lastRefreshAt = 0;

  constructor(
    private readonly repository: ProductsRepositoryContract,
    private readonly external: ExternalCatalogContract,
  ) {}

  async list() {
    return this.read(false);
  }

  refresh() {
    return this.read(true);
  }

  private async read(force: boolean) {
    let stale = false;
    let syncError: string | null = null;
    try {
      await this.sync(force);
    } catch (error) {
      stale = true;
      // Surface the specific upstream reason so an admin can act on it; fall
      // back to a generic message for unexpected failures.
      syncError =
        error instanceof HttpError
          ? error.message
          : "تعذر تحديث المنتجات الخارجية";
      await this.repository.recordSyncFailure(syncError);
    }

    const cached = await this.repository.getCatalog();
    if (!cached) {
      throw new HttpError(
        503,
        "لا توجد نسخة صالحة من المنتجات الخارجية متاحة للبيع",
      );
    }
    return { ...cached, stale, syncError };
  }

  async configureStock(
    externalProductId: number,
    data: ProductStockSetupInput,
  ) {
    const targets = await this.repository.getStockTargets(externalProductId);
    if (!targets.exists) throw new HttpError(404, "المنتج الخارجي غير موجود");

    const requestedSizes = data.sizes
      .map((size) => size.externalSizeId)
      .sort((a, b) => a - b);
    const expectedSizes = [...targets.sizeIds].sort((a, b) => a - b);
    const requestedOptions = data.modifiers
      .map((modifier) => modifier.externalModifierOptionId)
      .sort((a, b) => a - b);
    const expectedOptions = [...targets.modifierOptionIds].sort(
      (a, b) => a - b,
    );
    const sameIds = (left: number[], right: number[]) =>
      left.length === right.length &&
      left.every((value, index) => value === right[index]);

    if (
      !sameIds(requestedSizes, expectedSizes) ||
      !sameIds(requestedOptions, expectedOptions) ||
      (expectedSizes.length === 0
        ? data.baseIngredients.length === 0
        : data.baseIngredients.length > 0)
    ) {
      throw new HttpError(400, "يجب إعداد كل مقاسات وإضافات المنتج الحالي فقط");
    }
    await this.repository.saveStockSetup(externalProductId, data);
  }

  private async sync(force: boolean) {
    if (!force && Date.now() - this.lastRefreshAt < 5_000) return;
    if (!this.syncPromise) {
      this.syncPromise = (async () => {
        const catalog = await this.external.load();
        await this.repository.applyCatalog(catalog);
        this.lastRefreshAt = Date.now();
      })().finally(() => {
        this.syncPromise = null;
      });
    }
    await this.syncPromise;
  }
}
