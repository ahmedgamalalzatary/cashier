import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "../../db/index.js";
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
  items,
} from "../../db/schema.js";
import type { ExternalCatalog } from "../external/external-catalog.client.js";
import { HttpError } from "../../middleware/error.js";
import type { ProductStockSetupInput } from "./products.schemas.js";
import type { ProductsRepositoryContract } from "./products.service.js";

export class ProductsRepository implements ProductsRepositoryContract {
  constructor(private readonly db: Db) {}

  applyCatalog(catalog: ExternalCatalog): Promise<void> {
    return this.db.transaction(async (tx) => {
      const now = new Date();
      // Products first: a checkout locks external_products FOR UPDATE before
      // reading sizes, groups and options, so touching products first makes a
      // concurrent refresh block there instead of changing prices mid-sale.
      await tx.update(externalProducts).set({ isCurrent: false });
      await tx.update(externalCategories).set({ isCurrent: false });
      await tx.update(externalProductSizes).set({ isCurrent: false });
      await tx.update(externalModifierGroups).set({ isCurrent: false });
      await tx.update(externalModifierOptions).set({ isCurrent: false });

      for (const category of catalog.categories) {
        const values = { ...category, syncedAt: now, isCurrent: true };
        await tx
          .insert(externalCategories)
          .values(values)
          .onDuplicateKeyUpdate({ set: values });
      }
      for (const product of catalog.products) {
        const { sizes, modifierGroups, ...productValues } = product;
        const values = { ...productValues, syncedAt: now, isCurrent: true };
        await tx
          .insert(externalProducts)
          .values(values)
          .onDuplicateKeyUpdate({ set: values });

        for (const size of sizes) {
          const sizeValues = {
            ...size,
            externalProductId: product.externalId,
            syncedAt: now,
            isCurrent: true,
          };
          await tx
            .insert(externalProductSizes)
            .values(sizeValues)
            .onDuplicateKeyUpdate({ set: sizeValues });
        }
        for (const group of modifierGroups) {
          const { options, ...groupFields } = group;
          const groupValues = {
            ...groupFields,
            externalProductId: product.externalId,
            syncedAt: now,
            isCurrent: true,
          };
          await tx
            .insert(externalModifierGroups)
            .values(groupValues)
            .onDuplicateKeyUpdate({ set: groupValues });
          for (const option of options) {
            const optionValues = {
              ...option,
              externalModifierGroupId: group.externalId,
              syncedAt: now,
              isCurrent: true,
            };
            await tx
              .insert(externalModifierOptions)
              .values(optionValues)
              .onDuplicateKeyUpdate({
                set: {
                  nameAr: option.nameAr,
                  nameEn: option.nameEn,
                  extraPrice: option.extraPrice,
                  externalModifierGroupId: group.externalId,
                  syncedAt: now,
                  isCurrent: true,
                },
              });
          }
        }
      }

      await tx
        .insert(externalCatalogSync)
        .values({
          id: 1,
          lastSuccessfulSyncAt: now,
          lastAttemptAt: now,
          lastError: null,
        })
        .onDuplicateKeyUpdate({
          set: {
            lastSuccessfulSyncAt: now,
            lastAttemptAt: now,
            lastError: null,
          },
        });
    });
  }

  async recordSyncFailure(message: string) {
    const now = new Date();
    await this.db
      .insert(externalCatalogSync)
      .values({ id: 1, lastAttemptAt: now, lastError: message })
      .onDuplicateKeyUpdate({
        set: { lastAttemptAt: now, lastError: message },
      });
  }

  async getCatalog() {
    const [sync] = await this.db
      .select()
      .from(externalCatalogSync)
      .where(eq(externalCatalogSync.id, 1));
    if (!sync?.lastSuccessfulSyncAt) return null;

    const [categories, products, sizes, groups, options, productIngredients, sizeIngredients, modifierIngredients] =
      await Promise.all([
        this.db
          .select()
          .from(externalCategories)
          .where(eq(externalCategories.isCurrent, true))
          .orderBy(asc(externalCategories.displayOrder)),
        this.db
          .select()
          .from(externalProducts)
          .where(eq(externalProducts.isCurrent, true))
          .orderBy(asc(externalProducts.nameAr)),
        this.db
          .select()
          .from(externalProductSizes)
          .where(eq(externalProductSizes.isCurrent, true)),
        this.db
          .select()
          .from(externalModifierGroups)
          .where(eq(externalModifierGroups.isCurrent, true)),
        this.db
          .select()
          .from(externalModifierOptions)
          .where(eq(externalModifierOptions.isCurrent, true)),
        this.db.select().from(externalProductIngredients),
        this.db.select().from(externalSizeIngredients),
        this.db.select().from(externalModifierIngredients),
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
                (option) =>
                  option.externalModifierGroupId === group.externalId,
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
          (ingredient) =>
            ingredient.externalProductId === product.externalId,
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
        and(
          eq(externalProducts.externalId, externalProductId),
          eq(externalProducts.isCurrent, true),
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
          and(
            eq(externalProductSizes.externalProductId, externalProductId),
            eq(externalProductSizes.isCurrent, true),
          ),
        ),
      this.db
        .select({ externalId: externalModifierOptions.externalId })
        .from(externalModifierOptions)
        .innerJoin(
          externalModifierGroups,
          eq(
            externalModifierOptions.externalModifierGroupId,
            externalModifierGroups.externalId,
          ),
        )
        .where(
          and(
            eq(externalModifierGroups.externalProductId, externalProductId),
            eq(externalModifierGroups.isCurrent, true),
            eq(externalModifierOptions.isCurrent, true),
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
    return this.db.transaction(async (tx) => {
      const [product] = await tx
        .select({ externalId: externalProducts.externalId })
        .from(externalProducts)
        .where(
          and(
            eq(externalProducts.externalId, externalProductId),
            eq(externalProducts.isCurrent, true),
          ),
        )
        .for("update");
      if (!product) throw new HttpError(404, "المنتج الخارجي غير موجود");
      const lockedSizes = await tx
        .select({ externalId: externalProductSizes.externalId })
        .from(externalProductSizes)
        .where(
          and(
            eq(externalProductSizes.externalProductId, externalProductId),
            eq(externalProductSizes.isCurrent, true),
          ),
        )
        .orderBy(asc(externalProductSizes.externalId))
        .for("update");
      const lockedOptions = await tx
        .select({ externalId: externalModifierOptions.externalId })
        .from(externalModifierOptions)
        .innerJoin(
          externalModifierGroups,
          eq(
            externalModifierOptions.externalModifierGroupId,
            externalModifierGroups.externalId,
          ),
        )
        .where(
          and(
            eq(externalModifierGroups.externalProductId, externalProductId),
            eq(externalModifierGroups.isCurrent, true),
            eq(externalModifierOptions.isCurrent, true),
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
        .sort((a, b) => a - b);
      const uniqueItemIds = [...new Set(itemIds)];
      if (uniqueItemIds.length > 0) {
        const validItems = await tx
          .select({ id: items.id, isActive: items.isActive })
          .from(items)
          .where(inArray(items.id, uniqueItemIds))
          .orderBy(asc(items.id))
          .for("update");
        if (
          validItems.length !== uniqueItemIds.length ||
          validItems.some((item) => !item.isActive)
        ) {
          throw new HttpError(409, "أحد مكونات إعداد المخزون غير موجود أو موقوف");
        }
      }

      await tx
        .delete(externalProductIngredients)
        .where(
          eq(externalProductIngredients.externalProductId, externalProductId),
        );
      for (const ingredient of data.baseIngredients) {
        await tx.insert(externalProductIngredients).values({
          externalProductId,
          itemId: ingredient.itemId,
          quantity: ingredient.quantity.toFixed(3),
        });
      }

      for (const size of data.sizes) {
        await tx
          .delete(externalSizeIngredients)
          .where(
            eq(externalSizeIngredients.externalSizeId, size.externalSizeId),
          );
        for (const ingredient of size.ingredients) {
          await tx.insert(externalSizeIngredients).values({
            externalSizeId: size.externalSizeId,
            itemId: ingredient.itemId,
            quantity: ingredient.quantity.toFixed(3),
          });
        }
      }

      for (const modifier of data.modifiers) {
        await tx
          .delete(externalModifierIngredients)
          .where(
            eq(
              externalModifierIngredients.externalModifierOptionId,
              modifier.externalModifierOptionId,
            ),
          );
        await tx
          .update(externalModifierOptions)
          .set({ stockEffect: modifier.stockEffect })
          .where(
            eq(
              externalModifierOptions.externalId,
              modifier.externalModifierOptionId,
            ),
          );
        if (modifier.stockEffect === "mapped") {
          for (const ingredient of modifier.ingredients) {
            await tx.insert(externalModifierIngredients).values({
              externalModifierOptionId: modifier.externalModifierOptionId,
              itemId: ingredient.itemId,
              quantity: ingredient.quantity.toFixed(3),
            });
          }
        }
      }
    });
  }
}
