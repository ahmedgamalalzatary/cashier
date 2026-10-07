import {
  branchCondition,
  branchValues,
  branchTransaction,
} from "@cashier/db";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@cashier/db";
import {
  externalCatalogSync,
  externalCategories,
  externalModifierGroups,
  externalModifierIngredients,
  externalModifierOptions,
  externalProductIngredients,
  externalProducts,
  externalProductSizes,
  externalSizeIngredients,
  categories,
  items,
} from "@cashier/db";
import type { ExternalCatalog } from "../external/external-catalog.client.js";
import { HttpError } from "@cashier/server-core";
import type { ProductStockSetupInput } from "./products.schemas.js";
import type { ProductsRepositoryContract } from "./products.service.js";

const INSERT_CHUNK_SIZE = 250;
const chunks = <T>(rows: T[]) => {
  const result: T[][] = [];
  for (let index = 0; index < rows.length; index += INSERT_CHUNK_SIZE) {
    result.push(rows.slice(index, index + INSERT_CHUNK_SIZE));
  }
  return result;
};

export class ProductsRepository implements ProductsRepositoryContract {
  constructor(
    private readonly db: Db,
    private readonly recordCatalogSuccess = true,
  ) {}

  async getLocalCatalog() {
    const [categoryRows, products] = await Promise.all([
      this.db
        .select({
          id: categories.id,
          name: categories.name,
          parentId: categories.parentId,
        })
        .from(categories)
        .where(branchCondition(categories, eq(categories.isActive, true)))
        .orderBy(asc(categories.id)),
      this.db
        .select({
          id: items.id,
          name: items.name,
          categoryId: items.categoryId,
          sellingPrice: items.sellingPrice,
          stockUnit: items.stockUnit,
        })
        .from(items)
        .where(
          branchCondition(
            items,
            and(
              eq(items.isActive, true),
              eq(items.type, "resale"),
              sql`${items.sellingPrice} IS NOT NULL`,
            ),
          ),
        )
        .orderBy(asc(items.id)),
    ]);
    return { categories: categoryRows, products };
  }

  applyCatalog(catalog: ExternalCatalog): Promise<void> {
    return branchTransaction(this.db, async (tx) => {
      const now = new Date();
      // Products first: a checkout locks external_products FOR UPDATE before
      // reading sizes, groups and options, so touching products first makes a
      // concurrent refresh block there instead of changing prices mid-sale.
      await tx
        .update(externalProducts)
        .set({ isCurrent: false })
        .where(branchCondition(externalProducts));
      await tx
        .update(externalCategories)
        .set({ isCurrent: false })
        .where(branchCondition(externalCategories));
      await tx
        .update(externalProductSizes)
        .set({ isCurrent: false })
        .where(branchCondition(externalProductSizes));
      await tx
        .update(externalModifierGroups)
        .set({ isCurrent: false })
        .where(branchCondition(externalModifierGroups));
      await tx
        .update(externalModifierOptions)
        .set({ isCurrent: false })
        .where(branchCondition(externalModifierOptions));

      const categoryRows = catalog.categories.map((category) => ({
        ...category,
        syncedAt: now,
        isCurrent: true,
      }));
      for (const categoryChunk of chunks(categoryRows)) {
        await tx
          .insert(externalCategories)
          .values(branchValues(categoryChunk))
          .onDuplicateKeyUpdate({
            set: {
              nameAr: sql`values(name_ar)`,
              nameEn: sql`values(name_en)`,
              descriptionAr: sql`values(description_ar)`,
              descriptionEn: sql`values(description_en)`,
              isActive: sql`values(is_active)`,
              isVisible: sql`values(is_visible)`,
              displayOrder: sql`values(display_order)`,
              syncedAt: sql`values(synced_at)`,
              isCurrent: true,
            },
          });
      }
      const productRows = catalog.products.map(
        ({ sizes: _sizes, modifierGroups: _groups, ...product }) => ({
          ...product,
          syncedAt: now,
          isCurrent: true,
        }),
      );
      for (const productChunk of chunks(productRows)) {
        await tx
          .insert(externalProducts)
          .values(branchValues(productChunk))
          .onDuplicateKeyUpdate({
            set: {
              externalCategoryId: sql`values(external_category_id)`,
              nameAr: sql`values(name_ar)`,
              nameEn: sql`values(name_en)`,
              descriptionAr: sql`values(description_ar)`,
              descriptionEn: sql`values(description_en)`,
              imageUrl: sql`values(image_url)`,
              price: sql`values(price)`,
              discountPercentage: sql`values(discount_percentage)`,
              discountStart: sql`values(discount_start)`,
              discountEnd: sql`values(discount_end)`,
              calories: sql`values(calories)`,
              pointsReward: sql`values(points_reward)`,
              isAvailable: sql`values(is_available)`,
              isVisible: sql`values(is_visible)`,
              syncedAt: sql`values(synced_at)`,
              isCurrent: true,
            },
          });
      }
      const sizeRows = catalog.products.flatMap((product) =>
        product.sizes.map((size) => ({
          ...size,
          externalProductId: product.externalId,
          syncedAt: now,
          isCurrent: true,
        })),
      );
      for (const sizeChunk of chunks(sizeRows)) {
        await tx
          .insert(externalProductSizes)
          .values(branchValues(sizeChunk))
          .onDuplicateKeyUpdate({
            set: {
              externalProductId: sql`values(external_product_id)`,
              nameAr: sql`values(name_ar)`,
              nameEn: sql`values(name_en)`,
              price: sql`values(price)`,
              isDefault: sql`values(is_default)`,
              syncedAt: sql`values(synced_at)`,
              isCurrent: true,
            },
          });
      }
      const groupRows = catalog.products.flatMap((product) =>
        product.modifierGroups.map(({ options: _options, ...group }) => ({
          ...group,
          externalProductId: product.externalId,
          syncedAt: now,
          isCurrent: true,
        })),
      );
      for (const groupChunk of chunks(groupRows)) {
        await tx
          .insert(externalModifierGroups)
          .values(branchValues(groupChunk))
          .onDuplicateKeyUpdate({
            set: {
              externalProductId: sql`values(external_product_id)`,
              nameAr: sql`values(name_ar)`,
              nameEn: sql`values(name_en)`,
              isRequired: sql`values(is_required)`,
              maxSelections: sql`values(max_selections)`,
              syncedAt: sql`values(synced_at)`,
              isCurrent: true,
            },
          });
      }
      const optionRows = catalog.products.flatMap((product) =>
        product.modifierGroups.flatMap((group) =>
          group.options.map((option) => ({
            ...option,
            externalModifierGroupId: group.externalId,
            syncedAt: now,
            isCurrent: true,
          })),
        ),
      );
      for (const optionChunk of chunks(optionRows)) {
        await tx
          .insert(externalModifierOptions)
          .values(branchValues(optionChunk))
          .onDuplicateKeyUpdate({
            set: {
              nameAr: sql`values(name_ar)`,
              nameEn: sql`values(name_en)`,
              extraPrice: sql`values(extra_price)`,
              externalModifierGroupId: sql`values(external_modifier_group_id)`,
              syncedAt: sql`values(synced_at)`,
              isCurrent: true,
            },
          });
      }
      if (this.recordCatalogSuccess) {
        await tx
          .insert(externalCatalogSync)
          .values(
            branchValues({
              id: 1,
              lastSuccessfulSyncAt: now,
              lastAttemptAt: now,
              lastError: null,
            }),
          )
          .onDuplicateKeyUpdate({
            set: {
              lastSuccessfulSyncAt: now,
              lastAttemptAt: now,
              lastError: null,
            },
          });
      }
    });
  }

  async recordSyncFailure(message: string) {
    const now = new Date();
    await this.db
      .insert(externalCatalogSync)
      .values(branchValues({ id: 1, lastAttemptAt: now, lastError: message }))
      .onDuplicateKeyUpdate({
        set: { lastAttemptAt: now, lastError: message },
      });
  }

  async getCatalog() {
    const [sync] = await this.db
      .select()
      .from(externalCatalogSync)
      .where(
        branchCondition(externalCatalogSync, eq(externalCatalogSync.id, 1)),
      );
    if (!sync?.lastSuccessfulSyncAt) return null;

    const [
      categories,
      products,
      sizes,
      groups,
      options,
      productIngredients,
      sizeIngredients,
      modifierIngredients,
    ] = await Promise.all([
      this.db
        .select()
        .from(externalCategories)
        .where(
          branchCondition(
            externalCategories,
            eq(externalCategories.isCurrent, true),
          ),
        )
        .orderBy(asc(externalCategories.displayOrder)),
      this.db
        .select()
        .from(externalProducts)
        .where(
          branchCondition(
            externalProducts,
            eq(externalProducts.isCurrent, true),
          ),
        )
        .orderBy(asc(externalProducts.nameAr)),
      this.db
        .select()
        .from(externalProductSizes)
        .where(
          branchCondition(
            externalProductSizes,
            eq(externalProductSizes.isCurrent, true),
          ),
        ),
      this.db
        .select()
        .from(externalModifierGroups)
        .where(
          branchCondition(
            externalModifierGroups,
            eq(externalModifierGroups.isCurrent, true),
          ),
        ),
      this.db
        .select()
        .from(externalModifierOptions)
        .where(
          branchCondition(
            externalModifierOptions,
            eq(externalModifierOptions.isCurrent, true),
          ),
        ),
      this.db
        .select({
          externalProductId: externalProductIngredients.externalProductId,
          itemId: externalProductIngredients.itemId,
          quantity: externalProductIngredients.quantity,
        })
        .from(externalProductIngredients)
        .innerJoin(
          externalProducts,
          branchCondition(
            externalProducts,
            eq(
              externalProductIngredients.externalProductId,
              externalProducts.externalId,
            ),
          ),
        )
        .where(
          branchCondition(
            externalProductIngredients,
            eq(externalProducts.isCurrent, true),
          ),
        ),
      this.db
        .select({
          externalSizeId: externalSizeIngredients.externalSizeId,
          itemId: externalSizeIngredients.itemId,
          quantity: externalSizeIngredients.quantity,
        })
        .from(externalSizeIngredients)
        .innerJoin(
          externalProductSizes,
          branchCondition(
            externalProductSizes,
            eq(
              externalSizeIngredients.externalSizeId,
              externalProductSizes.externalId,
            ),
          ),
        )
        .where(
          branchCondition(
            externalSizeIngredients,
            eq(externalProductSizes.isCurrent, true),
          ),
        ),
      this.db
        .select({
          externalModifierOptionId:
            externalModifierIngredients.externalModifierOptionId,
          itemId: externalModifierIngredients.itemId,
          quantity: externalModifierIngredients.quantity,
        })
        .from(externalModifierIngredients)
        .innerJoin(
          externalModifierOptions,
          branchCondition(
            externalModifierOptions,
            eq(
              externalModifierIngredients.externalModifierOptionId,
              externalModifierOptions.externalId,
            ),
          ),
        )
        .where(
          branchCondition(
            externalModifierIngredients,
            eq(externalModifierOptions.isCurrent, true),
          ),
        ),
    ]);

    return {
      categories,
      products: products.map((product) => {
        const productSizes = sizes
          .filter((size) => size.externalProductId === product.externalId)
          .map((size) => ({
            ...size,
            ingredients: sizeIngredients.filter(
              (ingredient) => ingredient.externalSizeId === size.externalId,
            ),
          }));
        const productGroups = groups
          .filter((group) => group.externalProductId === product.externalId)
          .map((group) => ({
            ...group,
            options: options
              .filter(
                (option) => option.externalModifierGroupId === group.externalId,
              )
              .map((option) => ({
                ...option,
                ingredients: modifierIngredients.filter(
                  (ingredient) =>
                    ingredient.externalModifierOptionId === option.externalId,
                ),
              })),
          }));
        const baseIngredients = productIngredients.filter(
          (ingredient) => ingredient.externalProductId === product.externalId,
        );
        const baseConfigured =
          productSizes.length === 0
            ? baseIngredients.length > 0
            : productSizes.every((size) => size.ingredients.length > 0);
        const modifiersConfigured = productGroups.every((group) =>
          group.options.every(
            (option) =>
              option.stockEffect === "none" ||
              (option.stockEffect === "mapped" &&
                option.ingredients.length > 0),
          ),
        );
        // An unnamed modifier cannot be shown to a cashier or printed on a
        // receipt, so the product stays cached and configurable but is held
        // out of sale until the external catalog supplies its names.
        const modifierNamesMissing = productGroups.some(
          (group) =>
            group.nameAr === null ||
            group.nameEn === null ||
            group.options.some(
              (option) => option.nameAr === null || option.nameEn === null,
            ),
        );
        return {
          ...product,
          ingredients: baseIngredients,
          sizes: productSizes,
          modifierGroups: productGroups,
          stockConfigured: baseConfigured && modifiersConfigured,
          modifierNamesMissing,
          sellable:
            product.isAvailable &&
            product.isVisible &&
            baseConfigured &&
            modifiersConfigured &&
            !modifierNamesMissing,
        };
      }),
      lastSuccessfulSyncAt: sync.lastSuccessfulSyncAt,
    };
  }

  async getStockTargets(externalProductId: number) {
    const [product] = await this.db
      .select({ externalId: externalProducts.externalId })
      .from(externalProducts)
      .where(
        branchCondition(
          externalProducts,
          and(
            eq(externalProducts.externalId, externalProductId),
            eq(externalProducts.isCurrent, true),
          ),
        ),
      );
    if (!product) {
      return { exists: false, sizeIds: [], modifierOptionIds: [] };
    }
    const [sizes, options] = await Promise.all([
      this.db
        .select({ externalId: externalProductSizes.externalId })
        .from(externalProductSizes)
        .where(
          branchCondition(
            externalProductSizes,
            and(
              eq(externalProductSizes.externalProductId, externalProductId),
              eq(externalProductSizes.isCurrent, true),
            ),
          ),
        ),
      this.db
        .select({ externalId: externalModifierOptions.externalId })
        .from(externalModifierOptions)
        .innerJoin(
          externalModifierGroups,
          branchCondition(
            externalModifierGroups,
            eq(
              externalModifierOptions.externalModifierGroupId,
              externalModifierGroups.externalId,
            ),
          ),
        )
        .where(
          branchCondition(
            externalModifierOptions,
            and(
              eq(externalModifierGroups.externalProductId, externalProductId),
              eq(externalModifierGroups.isCurrent, true),
              eq(externalModifierOptions.isCurrent, true),
            ),
          ),
        ),
    ]);
    return {
      exists: true,
      sizeIds: sizes.map((size) => size.externalId),
      modifierOptionIds: options.map((option) => option.externalId),
    };
  }

  saveStockSetup(
    externalProductId: number,
    data: ProductStockSetupInput,
  ): Promise<void> {
    return branchTransaction(this.db, async (tx) => {
      const [product] = await tx
        .select({ externalId: externalProducts.externalId })
        .from(externalProducts)
        .where(
          branchCondition(
            externalProducts,
            and(
              eq(externalProducts.externalId, externalProductId),
              eq(externalProducts.isCurrent, true),
            ),
          ),
        )
        .for("update");
      if (!product) throw new HttpError(404, "المنتج الخارجي غير موجود");
      const lockedSizes = await tx
        .select({ externalId: externalProductSizes.externalId })
        .from(externalProductSizes)
        .where(
          branchCondition(
            externalProductSizes,
            and(
              eq(externalProductSizes.externalProductId, externalProductId),
              eq(externalProductSizes.isCurrent, true),
            ),
          ),
        )
        .orderBy(asc(externalProductSizes.externalId))
        .for("update");
      const lockedOptions = await tx
        .select({ externalId: externalModifierOptions.externalId })
        .from(externalModifierOptions)
        .innerJoin(
          externalModifierGroups,
          branchCondition(
            externalModifierGroups,
            eq(
              externalModifierOptions.externalModifierGroupId,
              externalModifierGroups.externalId,
            ),
          ),
        )
        .where(
          branchCondition(
            externalModifierOptions,
            and(
              eq(externalModifierGroups.externalProductId, externalProductId),
              eq(externalModifierGroups.isCurrent, true),
              eq(externalModifierOptions.isCurrent, true),
            ),
          ),
        )
        .orderBy(asc(externalModifierOptions.externalId))
        .for("update");
      const requestedSizes = data.sizes
        .map((size) => size.externalSizeId)
        .sort((left, right) => left - right);
      const requestedOptions = data.modifiers
        .map((modifier) => modifier.externalModifierOptionId)
        .sort((left, right) => left - right);
      const sameIds = (
        requested: number[],
        locked: Array<{ externalId: number }>,
      ) =>
        requested.length === locked.length &&
        requested.every((id, index) => id === locked[index]!.externalId);
      if (
        !sameIds(requestedSizes, lockedSizes) ||
        !sameIds(requestedOptions, lockedOptions) ||
        (lockedSizes.length === 0
          ? data.baseIngredients.length === 0
          : data.baseIngredients.length > 0)
      ) {
        throw new HttpError(
          409,
          "تغير الكتالوج أثناء إعداد المخزون؛ أعد فتح المنتج وحاول مرة أخرى",
        );
      }

      const itemIds = [
        ...data.baseIngredients,
        ...data.sizes.flatMap((size) => size.ingredients),
        ...data.modifiers.flatMap((modifier) =>
          modifier.stockEffect === "mapped" ? modifier.ingredients : [],
        ),
      ]
        .map((ingredient) => ingredient.itemId)
        .sort((a, b) => (a).localeCompare(b));
      const uniqueItemIds = [...new Set(itemIds)];
      if (uniqueItemIds.length > 0) {
        const [existingBase, existingSizes, existingModifiers] =
          await Promise.all([
            tx
              .select({ itemId: externalProductIngredients.itemId })
              .from(externalProductIngredients)
              .where(
                branchCondition(
                  externalProductIngredients,
                  eq(
                    externalProductIngredients.externalProductId,
                    externalProductId,
                  ),
                ),
              ),
            lockedSizes.length > 0
              ? tx
                  .select({ itemId: externalSizeIngredients.itemId })
                  .from(externalSizeIngredients)
                  .where(
                    branchCondition(
                      externalSizeIngredients,
                      inArray(
                        externalSizeIngredients.externalSizeId,
                        lockedSizes.map((size) => size.externalId),
                      ),
                    ),
                  )
              : Promise.resolve([]),
            lockedOptions.length > 0
              ? tx
                  .select({ itemId: externalModifierIngredients.itemId })
                  .from(externalModifierIngredients)
                  .where(
                    branchCondition(
                      externalModifierIngredients,
                      inArray(
                        externalModifierIngredients.externalModifierOptionId,
                        lockedOptions.map((option) => option.externalId),
                      ),
                    ),
                  )
              : Promise.resolve([]),
          ]);
        const existingItemIds = new Set(
          [...existingBase, ...existingSizes, ...existingModifiers].map(
            (ingredient) => ingredient.itemId,
          ),
        );
        const validItems = await tx
          .select({ id: items.id, isActive: items.isActive })
          .from(items)
          .where(branchCondition(items, inArray(items.id, uniqueItemIds)))
          .orderBy(asc(items.id))
          .for("update");
        if (
          validItems.length !== uniqueItemIds.length ||
          validItems.some(
            (item) => !item.isActive && !existingItemIds.has(item.id),
          )
        ) {
          throw new HttpError(
            409,
            "أحد مكونات إعداد المخزون غير موجود أو موقوف",
          );
        }
      }

      await tx
        .delete(externalProductIngredients)
        .where(
          branchCondition(
            externalProductIngredients,
            eq(externalProductIngredients.externalProductId, externalProductId),
          ),
        );
      const baseIngredientRows = data.baseIngredients.map((ingredient) => ({
        externalProductId,
        itemId: ingredient.itemId,
        quantity: ingredient.quantity.toFixed(3),
      }));
      for (const ingredientChunk of chunks(baseIngredientRows)) {
        await tx
          .insert(externalProductIngredients)
          .values(branchValues(ingredientChunk));
      }

      const sizeIngredientRows = data.sizes.flatMap((size) =>
        size.ingredients.map((ingredient) => ({
          externalSizeId: size.externalSizeId,
          itemId: ingredient.itemId,
          quantity: ingredient.quantity.toFixed(3),
        })),
      );
      for (const size of data.sizes) {
        await tx
          .delete(externalSizeIngredients)
          .where(
            branchCondition(
              externalSizeIngredients,
              eq(externalSizeIngredients.externalSizeId, size.externalSizeId),
            ),
          );
      }
      for (const ingredientChunk of chunks(sizeIngredientRows)) {
        await tx
          .insert(externalSizeIngredients)
          .values(branchValues(ingredientChunk));
      }

      const modifierIngredientRows = data.modifiers.flatMap((modifier) =>
        modifier.stockEffect === "mapped"
          ? modifier.ingredients.map((ingredient) => ({
              externalModifierOptionId: modifier.externalModifierOptionId,
              itemId: ingredient.itemId,
              quantity: ingredient.quantity.toFixed(3),
            }))
          : [],
      );
      for (const modifier of data.modifiers) {
        await tx
          .delete(externalModifierIngredients)
          .where(
            branchCondition(
              externalModifierIngredients,
              eq(
                externalModifierIngredients.externalModifierOptionId,
                modifier.externalModifierOptionId,
              ),
            ),
          );
        await tx
          .update(externalModifierOptions)
          .set({ stockEffect: modifier.stockEffect })
          .where(
            branchCondition(
              externalModifierOptions,
              eq(
                externalModifierOptions.externalId,
                modifier.externalModifierOptionId,
              ),
            ),
          );
      }
      for (const ingredientChunk of chunks(modifierIngredientRows)) {
        await tx
          .insert(externalModifierIngredients)
          .values(branchValues(ingredientChunk));
      }
    });
  }
}
