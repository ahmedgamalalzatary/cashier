import {
  branchCondition,
  branchValues,
  branchTransaction,
  currentBranchId,
  quoteIdentifier,
} from "@cashier/db";
import { getTableConfig, type AnyMySqlColumn } from "drizzle-orm/mysql-core";
import { and, asc, eq, inArray, notInArray, sql } from "drizzle-orm";
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

type CatalogTable =
  | typeof externalCategories
  | typeof externalProducts
  | typeof externalProductSizes
  | typeof externalModifierGroups
  | typeof externalModifierOptions;
type CatalogTx = Parameters<Parameters<typeof branchTransaction>[1]>[0];

/**
 * Every write to the catalog tables is queued for the online backup, and MySQL
 * runs the capture trigger even when an upsert leaves a row identical. New rows
 * are inserted; existing rows are updated only where MySQL finds a value that
 * differs, so an unchanged catalog queues nothing.
 */
async function writeChangedRows(
  tx: CatalogTx,
  table: CatalogTable,
  rows: Array<{ externalId: number }>,
  now: Date,
  fields: string[],
) {
  if (!rows.length) return;
  const known = new Set(
    (
      await tx
        .select({ externalId: table.externalId })
        .from(table)
        .where(branchCondition(table))
    ).map((row) => row.externalId),
  );
  const fresh = rows
    .filter((row) => !known.has(row.externalId))
    .map((row) => ({ ...row, syncedAt: now, isCurrent: true }));
  for (const chunk of chunks(fresh))
    await tx.insert(table).values(branchValues(chunk) as never);
  const existing = rows.filter((row) => known.has(row.externalId));
  const columns = table as unknown as Record<string, AnyMySqlColumn>;
  const name = (field: string) => sql.raw(quoteIdentifier(columns[field].name));
  const value = (row: Record<string, unknown>, field: string) =>
    row[field] === null || row[field] === undefined
      ? null
      : columns[field].mapToDriverValue(row[field]);
  const target = sql.raw(quoteIdentifier(getTableConfig(table).name));
  for (const chunk of chunks(existing)) {
    const tuples = chunk.map(
      (row) =>
        sql`ROW(${sql.join(
          [
            sql`${row.externalId}`,
            ...fields.map(
              (field) => sql`${value(row as Record<string, unknown>, field)}`,
            ),
          ],
          sql`, `,
        )})`,
    );
    await tx.execute(sql`UPDATE ${target} JOIN (VALUES ${sql.join(tuples, sql`, `)}) AS incoming (external_id, ${sql.join(fields.map(name), sql`, `)})
      ON ${target}.external_id = incoming.external_id
      SET ${sql.join(
        fields.map((field) => sql`${target}.${name(field)} = incoming.${name(field)}`),
        sql`, `,
      )}, ${target}.synced_at = ${columns.syncedAt.mapToDriverValue(now)}, ${target}.is_current = TRUE
      WHERE ${target}.branch_id = ${currentBranchId()}
        AND (${target}.is_current = FALSE OR ${sql.join(
          fields.map((field) => sql`NOT (${target}.${name(field)} <=> incoming.${name(field)})`),
          sql` OR `,
        )})`);
  }
}

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
      // reading sizes, groups and options, so locking products first makes a
      // concurrent refresh block there instead of changing prices mid-sale.
      await tx
        .select({ externalId: externalProducts.externalId })
        .from(externalProducts)
        .where(branchCondition(externalProducts))
        .for("update");
      // Every write here is queued for the online backup, so only rows that
      // left the upstream catalog are retired; unchanged rows stay untouched.
      const sizes = catalog.products.flatMap((product) => product.sizes);
      const groups = catalog.products.flatMap(
        (product) => product.modifierGroups,
      );
      const options = groups.flatMap((group) => group.options);
      const retire = async (
        table:
          | typeof externalProducts
          | typeof externalCategories
          | typeof externalProductSizes
          | typeof externalModifierGroups
          | typeof externalModifierOptions,
        current: Array<{ externalId: number }>,
      ) =>
        tx
          .update(table)
          .set({ isCurrent: false })
          .where(
            branchCondition(
              table,
              and(
                eq(table.isCurrent, true),
                current.length
                  ? notInArray(
                      table.externalId,
                      current.map((row) => row.externalId),
                    )
                  : undefined,
              ),
            ),
          );
      await retire(externalProducts, catalog.products);
      await retire(externalCategories, catalog.categories);
      await retire(externalProductSizes, sizes);
      await retire(externalModifierGroups, groups);
      await retire(externalModifierOptions, options);

      await writeChangedRows(tx, externalCategories, catalog.categories, now, [
        "nameAr",
        "nameEn",
        "descriptionAr",
        "descriptionEn",
        "isActive",
        "isVisible",
        "displayOrder",
      ]);
      await writeChangedRows(
        tx,
        externalProducts,
        catalog.products.map(
          ({ sizes: _sizes, modifierGroups: _groups, ...product }) => product,
        ),
        now,
        [
          "externalCategoryId",
          "nameAr",
          "nameEn",
          "descriptionAr",
          "descriptionEn",
          "imageUrl",
          "price",
          "discountPercentage",
          "discountStart",
          "discountEnd",
          "calories",
          "pointsReward",
          "isAvailable",
          "isVisible",
        ],
      );
      await writeChangedRows(
        tx,
        externalProductSizes,
        catalog.products.flatMap((product) =>
          product.sizes.map((size) => ({
            ...size,
            externalProductId: product.externalId,
          })),
        ),
        now,
        ["externalProductId", "nameAr", "nameEn", "price", "isDefault"],
      );
      await writeChangedRows(
        tx,
        externalModifierGroups,
        catalog.products.flatMap((product) =>
          product.modifierGroups.map(({ options: _options, ...group }) => ({
            ...group,
            externalProductId: product.externalId,
          })),
        ),
        now,
        ["externalProductId", "nameAr", "nameEn", "isRequired", "maxSelections"],
      );
      await writeChangedRows(
        tx,
        externalModifierOptions,
        catalog.products.flatMap((product) =>
          product.modifierGroups.flatMap((group) =>
            group.options.map((option) => ({
              ...option,
              externalModifierGroupId: group.externalId,
            })),
          ),
        ),
        now,
        ["nameAr", "nameEn", "extraPrice", "externalModifierGroupId"],
      );
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
