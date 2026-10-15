import { branchCondition, branchTransaction, branchValues } from "@cashier/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@cashier/db";
import {
  externalModifierGroups,
  externalModifierIngredients,
  externalModifierOptions,
  externalProductIngredients,
  externalProducts,
  externalProductSizes,
  externalSizeIngredients,
  items,
} from "@cashier/db";
import { HttpError } from "@cashier/server-core";
import type { ProductStockSetupInput } from "./products.schemas.js";
import { chunks } from "./products.repository.helpers.js";

export async function getStockTargets(db: Db, externalProductId: number) {
  const [product] = await db
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
    db
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
    db
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

export function saveStockSetup(
  db: Db,
  externalProductId: number,
  data: ProductStockSetupInput,
): Promise<void> {
  return branchTransaction(db, async (tx) => {
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
      .sort((a, b) => a.localeCompare(b));
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
        throw new HttpError(409, "أحد مكونات إعداد المخزون غير موجود أو موقوف");
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
