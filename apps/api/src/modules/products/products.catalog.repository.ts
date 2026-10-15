import { branchCondition } from "@cashier/db";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "@cashier/db";
import {
  categories,
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
} from "@cashier/db";

export async function getLocalCatalog(db: Db) {
  const [categoryRows, products] = await Promise.all([
    db
      .select({
        id: categories.id,
        name: categories.name,
        parentId: categories.parentId,
      })
      .from(categories)
      .where(branchCondition(categories, eq(categories.isActive, true)))
      .orderBy(asc(categories.id)),
    db
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

export async function getCatalog(db: Db) {
  const [sync] = await db
    .select()
    .from(externalCatalogSync)
    .where(branchCondition(externalCatalogSync, eq(externalCatalogSync.id, 1)));
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
    db
      .select()
      .from(externalCategories)
      .where(
        branchCondition(
          externalCategories,
          eq(externalCategories.isCurrent, true),
        ),
      )
      .orderBy(asc(externalCategories.displayOrder)),
    db
      .select()
      .from(externalProducts)
      .where(
        branchCondition(externalProducts, eq(externalProducts.isCurrent, true)),
      )
      .orderBy(asc(externalProducts.nameAr)),
    db
      .select()
      .from(externalProductSizes)
      .where(
        branchCondition(
          externalProductSizes,
          eq(externalProductSizes.isCurrent, true),
        ),
      ),
    db
      .select()
      .from(externalModifierGroups)
      .where(
        branchCondition(
          externalModifierGroups,
          eq(externalModifierGroups.isCurrent, true),
        ),
      ),
    db
      .select()
      .from(externalModifierOptions)
      .where(
        branchCondition(
          externalModifierOptions,
          eq(externalModifierOptions.isCurrent, true),
        ),
      ),
    db
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
    db
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
    db
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
            (option.stockEffect === "mapped" && option.ingredients.length > 0),
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
