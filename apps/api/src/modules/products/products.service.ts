import type { ExternalCategory, ExternalProduct } from "@cashier/shared";
import { HttpError } from "../../middleware/error.js";
import type { ProductStockSetupInput } from "./products.schemas.js";

type CachedCatalog = {
  categories: ExternalCategory[];
  products: ExternalProduct[];
  lastSuccessfulSyncAt: Date;
};

export type ProductsRepositoryContract = {
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

export class ProductsService {
  constructor(private readonly repository: ProductsRepositoryContract) {}

  async list() {
    return this.readCached();
  }

  private async readCached(stale = false, syncError: string | null = null) {
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
}
