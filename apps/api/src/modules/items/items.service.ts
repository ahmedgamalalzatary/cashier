import { HttpError } from "../../middleware/error.js";
import type { ItemsRepository } from "./items.repository.js";
import {
  hasValidPurchaseUnitConfiguration,
  type ItemInput,
  type ItemUpdateInput,
} from "./items.schemas.js";

export class ItemsService {
  constructor(private repo: ItemsRepository) {}

  list() {
    return this.repo.list();
  }

  private async validateCategory(repo: ItemsRepository, categoryId: number) {
    const categories = await repo.lockCategories([categoryId]);
    const category = categories.find((row) => row.id === categoryId);
    if (!category) throw new HttpError(400, "التصنيف غير موجود");
    if (!category.isActive) throw new HttpError(409, "التصنيف موقوف");
    if (
      category.parentId === null &&
      (await repo.categoryHasChildren(categoryId))
    ) {
      throw new HttpError(
        409,
        "اختر تصنيفاً فرعياً؛ هذا التصنيف الرئيسي يحتوي على فروع",
      );
    }
  }

  create(data: ItemInput) {
    return this.repo.transaction(async (repo) => {
      await this.validateCategory(repo, data.categoryId);
      return repo.create(data);
    });
  }

  update(id: number, data: ItemUpdateInput) {
    return this.repo.transaction(async (repo) => {
      const item = await repo.findByIdForUpdate(id);
      if (!item) throw new HttpError(404, "الصنف غير موجود");

      const categoryChanged =
        data.categoryId !== undefined && data.categoryId !== item.categoryId;
      if (categoryChanged || data.isActive === true) {
        await this.validateCategory(repo, data.categoryId ?? item.categoryId);
      }

      const purchaseUnit =
        data.purchaseUnit !== undefined ? data.purchaseUnit : item.purchaseUnit;
      const purchaseToStockFactor =
        data.purchaseToStockFactor !== undefined
          ? data.purchaseToStockFactor
          : item.purchaseToStockFactor;
      if (
        !hasValidPurchaseUnitConfiguration({
          purchaseUnit,
          purchaseToStockFactor:
            purchaseToStockFactor === null
              ? null
              : Number(purchaseToStockFactor),
        })
      ) {
        throw new HttpError(400, "وحدة الشراء ومعامل التحويل مطلوبان معاً");
      }

      const resultingType = data.type ?? item.type;
      const resultingSellingPrice =
        data.sellingPrice !== undefined
          ? data.sellingPrice
          : item.sellingPrice === null
            ? null
            : Number(item.sellingPrice);
      if (
        resultingType === "resale" &&
        item.type !== "resale" &&
        data.sellingPrice == null
      ) {
        throw new HttpError(400, "سعر البيع مطلوب عند التحويل إلى إعادة البيع");
      }
      if (resultingType === "resale" && resultingSellingPrice == null) {
        throw new HttpError(400, "سعر البيع مطلوب لصنف إعادة البيع");
      }
      if (resultingType !== "resale" && data.sellingPrice != null) {
        throw new HttpError(400, "سعر البيع متاح فقط لصنف إعادة البيع");
      }

      const changesStockMeaning =
        (data.stockUnit !== undefined && data.stockUnit !== item.stockUnit) ||
        (data.type !== undefined && data.type !== item.type);
      if (
        changesStockMeaning &&
        ((await repo.hasStockHistory(id)) ||
          (await repo.hasActiveRecipeReferences(id)))
      ) {
        throw new HttpError(
          409,
          "لا يمكن تغيير نوع الصنف أو وحدة المخزون بعد تسجيل حركة مخزون أو ربطه بوصفة نشطة",
        );
      }
      await repo.update(
        id,
        resultingType === "resale" ? data : { ...data, sellingPrice: null },
      );
    });
  }

  deactivate(id: number) {
    return this.repo.transaction(async (repo) => {
      const item = await repo.findByIdForUpdate(id);
      if (!item) throw new HttpError(404, "الصنف غير موجود");
      if (!item.isActive) return;
      if (await repo.hasActiveRecipeReferences(id)) {
        throw new HttpError(409, "لا يمكن إيقاف صنف مرتبط بوصفة نشطة");
      }
      await repo.deactivate(id);
    });
  }
}
