import { HttpError } from "../../middleware/error.js";
import type { ItemsRepository } from "./items.repository.js";
import type { ItemInput, ItemUpdateInput } from "./items.schemas.js";

const duplicateEntry = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === "ER_DUP_ENTRY";

export class ItemsService {
  constructor(private repo: ItemsRepository) {}

  list() {
    return this.repo.list();
  }

  private async validate(
    repo: ItemsRepository,
    categoryId: number,
    variants: ItemInput["variants"],
  ) {
    const category = (await repo.lockCategories([categoryId]))[0];
    if (!category) throw new HttpError(400, "التصنيف غير موجود");
    if (!category.isActive) throw new HttpError(409, "التصنيف موقوف");
    if (
      category.parentId === null &&
      (await repo.categoryHasChildren(categoryId))
    )
      throw new HttpError(
        409,
        "اختر تصنيفاً فرعياً؛ هذا التصنيف الرئيسي يحتوي على فروع",
      );
    const [colors, sizes] = await repo.lockOptions(
      categoryId,
      variants.map((row) => row.colorId),
      variants.map((row) => row.sizeId),
    );
    if (
      colors.length !== new Set(variants.map((row) => row.colorId)).size ||
      sizes.length !== new Set(variants.map((row) => row.sizeId)).size
    )
      throw new HttpError(400, "أحد الألوان أو المقاسات لا يتبع التصنيف");
    if (
      colors.some((row) => !row.isActive) ||
      sizes.some((row) => !row.isActive)
    )
      throw new HttpError(409, "أحد الألوان أو المقاسات موقوف");
  }

  async create(data: ItemInput) {
    try {
      return await this.repo.transaction(async (repo) => {
        await this.validate(repo, data.categoryId, data.variants);
        const id = await repo.createProduct(data.name, data.categoryId);
        await repo.createVariants(
          id,
          data.variants,
          await repo.nextItemCodes(data.variants.length),
        );
        return id;
      });
    } catch (error) {
      if (duplicateEntry(error))
        throw new HttpError(
          409,
          "الباركود أو تركيبة اللون والمقاس مستخدمة بالفعل",
        );
      throw error;
    }
  }

  async update(id: number, data: ItemUpdateInput) {
    try {
      return await this.repo.transaction(async (repo) => {
        const product = await repo.findProductForUpdate(id);
        if (!product) throw new HttpError(404, "المنتج غير موجود");
        if (
          data.categoryId !== undefined &&
          data.categoryId !== product.categoryId
        )
          throw new HttpError(
            409,
            "لا يمكن تغيير تصنيف منتج له متغيرات؛ أنشئ منتجاً جديداً",
          );
        if (data.variants) {
          const existingVariants = data.variants.filter(
            (row): row is typeof row & { id: number } => row.id !== undefined,
          );
          if (existingVariants.length) {
            const locked = await repo.lockVariantsForProduct(
              id,
              existingVariants.map((row) => row.id),
            );
            if (locked.length !== existingVariants.length)
              throw new HttpError(400, "أحد المتغيرات لا يتبع هذا المنتج");
          }
          const newVariants = data.variants.filter(
            (row) => row.id === undefined,
          );
          if (newVariants.length)
            await this.validate(repo, product.categoryId, newVariants);
        }
        await repo.updateProduct(id, data);
        if (data.variants) {
          const existingVariants = data.variants.filter(
            (row): row is typeof row & { id: number } => row.id !== undefined,
          );
          if (existingVariants.length)
            await repo.updateVariants(id, existingVariants);
          const newVariants = data.variants.filter(
            (row) => row.id === undefined,
          );
          if (newVariants.length)
            await repo.createVariants(
              id,
              newVariants,
              await repo.nextItemCodes(newVariants.length),
            );
        }
      });
    } catch (error) {
      if (duplicateEntry(error))
        throw new HttpError(
          409,
          "الباركود أو تركيبة اللون والمقاس مستخدمة بالفعل",
        );
      throw error;
    }
  }

  deactivate(id: number) {
    return this.repo.transaction(async (repo) => {
      const product = await repo.findProductForUpdate(id);
      if (!product) throw new HttpError(404, "المنتج غير موجود");
      if (!product.isActive) return;
      await repo.deactivateProduct(id);
    });
  }
}
