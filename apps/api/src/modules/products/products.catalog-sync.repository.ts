import { branchCondition, branchTransaction, branchValues } from "@cashier/db";
import { and, eq, notInArray } from "drizzle-orm";
import type { Db } from "@cashier/db";
import {
  externalCatalogSync,
  externalCategories,
  externalModifierGroups,
  externalModifierOptions,
  externalProducts,
  externalProductSizes,
} from "@cashier/db";
import type { ExternalCatalog } from "../external/external-catalog.client.js";
import { writeChangedRows } from "./products.repository.helpers.js";

export function applyCatalog(
  db: Db,
  recordCatalogSuccess: boolean,
  catalog: ExternalCatalog,
): Promise<void> {
  return branchTransaction(db, async (tx) => {
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
    if (recordCatalogSuccess) {
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

export async function recordSyncFailure(db: Db, message: string) {
  const now = new Date();
  await db
    .insert(externalCatalogSync)
    .values(branchValues({ id: 1, lastAttemptAt: now, lastError: message }))
    .onDuplicateKeyUpdate({
      set: { lastAttemptAt: now, lastError: message },
    });
}
