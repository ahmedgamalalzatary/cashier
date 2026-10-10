import { it, testBranchValues } from "../support/ids.js";
import { currentBranchId } from "../../src/branch-context.js";
import { describe, expect } from "vitest";
import { eq } from "drizzle-orm";
import { categories, items } from "@cashier/db";
import type { ExternalCatalog } from "../../../../apps/api/src/modules/external/external-catalog.client.js";
import { ProductsRepository } from "../../../../apps/api/src/modules/products/products.repository.js";
import { db, nextTestItemCode } from "../support/api-setup.js";

const catalog = (nameAr = "قهوة"): ExternalCatalog => ({
  categories: [
    {
      externalId: 3,
      nameAr: "مشروبات",
      nameEn: "Drinks",
      descriptionAr: null,
      descriptionEn: null,
      isActive: true,
      isVisible: true,
      displayOrder: 1,
    },
  ],
  products: [
    {
      externalId: 9,
      externalCategoryId: 3,
      nameAr,
      nameEn: "Coffee",
      descriptionAr: null,
      descriptionEn: null,
      price: "30.00",
      discountPercentage: null,
      discountStart: null,
      discountEnd: null,
      calories: 10,
      pointsReward: 3,
      isAvailable: true,
      isVisible: true,
      imageUrl: null,
      sizes: [],
      modifierGroups: [
        {
          externalId: 92,
          nameAr: "اختيارات",
          nameEn: "Choices",
          isRequired: false,
          maxSelections: 1,
          options: [
            {
              externalId: 93,
              nameAr: "بدون سكر",
              nameEn: "No sugar",
              extraPrice: "0.00",
            },
          ],
        },
      ],
    },
  ],
});

/** Catalog changes the capture triggers queued for backup after `afterSeq`. */
async function queuedCatalogChanges(afterSeq: number) {
  const [rows] = await db.$client.query(
    "SELECT table_name AS tableName, JSON_EXTRACT(row_json, '$.is_current') AS isCurrent FROM sync_outbox WHERE seq > ? AND table_name LIKE 'external\\_%' AND JSON_UNQUOTE(JSON_EXTRACT(pk, '$.branch_id')) = ? ORDER BY seq",
    [afterSeq, currentBranchId()],
  );
  return rows as Array<{ tableName: string; isCurrent: number | null }>;
}
async function lastQueuedSeq() {
  const [rows] = await db.$client.query(
    "SELECT COALESCE(MAX(seq), 0) AS seq FROM sync_outbox",
  );
  return Number((rows as Array<{ seq: number }>)[0].seq);
}

describe("catalog refresh backup traffic", () => {
  it("queues nothing when the upstream catalog did not change", async () => {
    const repository = new ProductsRepository(db);
    await repository.applyCatalog(catalog());
    const before = await lastQueuedSeq();

    await repository.applyCatalog(catalog());

    expect(await queuedCatalogChanges(before)).toEqual([]);
  });

  it("queues only the row whose content changed", async () => {
    const repository = new ProductsRepository(db);
    await repository.applyCatalog(catalog());
    const before = await lastQueuedSeq();

    await repository.applyCatalog(catalog("قهوة محدثة"));

    expect(await queuedCatalogChanges(before)).toEqual([
      { tableName: "external_products", isCurrent: 1 },
    ]);
  });

  it("queues one retirement for each row that left the catalog", async () => {
    const repository = new ProductsRepository(db);
    await repository.applyCatalog(catalog());
    const before = await lastQueuedSeq();

    await repository.applyCatalog({ ...catalog(), products: [] });

    expect(
      (await queuedCatalogChanges(before)).sort((a, b) =>
        a.tableName.localeCompare(b.tableName),
      ),
    ).toEqual([
      { tableName: "external_modifier_groups", isCurrent: 0 },
      { tableName: "external_modifier_options", isCurrent: 0 },
      { tableName: "external_products", isCurrent: 0 },
    ]);
  });
});

describe("ProductsRepository catalog reconciliation", () => {
  it("preserves local stock setup across refreshes and hides missing upstream products", async () => {
    const [category] = await db.insert(categories).values(testBranchValues({ name: "مخزون" })).$returningId();
    const [ingredient] = await db.insert(items).values(testBranchValues({
      code: nextTestItemCode(),
      name: "بن",
      categoryId: category.id,
      type: "raw",
      stockUnit: "كجم",
    })).$returningId();
    const repository = new ProductsRepository(db);
    await repository.applyCatalog(catalog());
    await repository.saveStockSetup(9, {
      baseIngredients: [{ itemId: ingredient.id, quantity: 0.02 }],
      sizes: [],
      modifiers: [{ externalModifierOptionId: 93, stockEffect: "none" }],
    });

    await repository.applyCatalog(catalog("قهوة محدثة"));
    const refreshed = await repository.getCatalog();
    expect(refreshed?.products).toEqual([
      expect.objectContaining({
        externalId: 9,
        nameAr: "قهوة محدثة",
        stockConfigured: true,
        sellable: true,
        ingredients: [
          expect.objectContaining({
            itemId: ingredient.id,
            quantity: "0.020",
          }),
        ],
        modifierGroups: [
          expect.objectContaining({
            options: [expect.objectContaining({ stockEffect: "none" })],
          }),
        ],
      }),
    ]);

    await repository.applyCatalog({ ...catalog(), products: [] });
    expect((await repository.getCatalog())?.products).toEqual([]);
    expect(
      await db.select().from(items).where(eq(items.id, ingredient.id)),
    ).toHaveLength(1);
  });

  it("marks a product with incomplete stock setup as not sellable", async () => {
    const repository = new ProductsRepository(db);
    await repository.applyCatalog(catalog());

    const cached = await repository.getCatalog();
    expect(cached?.products).toEqual([
      expect.objectContaining({
        externalId: 9,
        stockConfigured: false,
        sellable: false,
      }),
    ]);
  });

  it("preserves an unchanged mapping when its item was later deactivated", async () => {
    const [category] = await db.insert(categories).values(testBranchValues({ name: "مخزون" })).$returningId();
    const [ingredient] = await db.insert(items).values(testBranchValues({
      code: nextTestItemCode(),
      name: "بن قديم",
      categoryId: category.id,
      type: "raw",
      stockUnit: "كجم",
    })).$returningId();
    const repository = new ProductsRepository(db);
    await repository.applyCatalog(catalog());
    const setup = {
      baseIngredients: [{ itemId: ingredient.id, quantity: 0.02 }],
      sizes: [],
      modifiers: [
        { externalModifierOptionId: 93, stockEffect: "none" as const },
      ],
    };
    await repository.saveStockSetup(9, setup);
    await db
      .update(items)
      .set({ isActive: false })
      .where(eq(items.id, ingredient.id));

    await expect(repository.saveStockSetup(9, setup)).resolves.toBeUndefined();
  });

  it("caches a product with unnamed modifiers but keeps it out of sale", async () => {
    const [category] = await db.insert(categories).values(testBranchValues({ name: "مخزون" })).$returningId();
    const [ingredient] = await db.insert(items).values(testBranchValues({
      code: nextTestItemCode(),
      name: "بن",
      categoryId: category.id,
      type: "raw",
      stockUnit: "كجم",
    })).$returningId();
    const repository = new ProductsRepository(db);
    const unnamed = catalog();
    unnamed.products[0]!.modifierGroups[0]!.nameAr = null;
    unnamed.products[0]!.modifierGroups[0]!.nameEn = null;
    unnamed.products[0]!.modifierGroups[0]!.options[0]!.nameAr = null;
    unnamed.products[0]!.modifierGroups[0]!.options[0]!.nameEn = null;

    await repository.applyCatalog(unnamed);
    await repository.saveStockSetup(9, {
      baseIngredients: [{ itemId: ingredient.id, quantity: 0.02 }],
      sizes: [],
      modifiers: [{ externalModifierOptionId: 93, stockEffect: "none" }],
    });

    expect((await repository.getCatalog())?.products).toEqual([
      expect.objectContaining({
        externalId: 9,
        stockConfigured: true,
        modifierNamesMissing: true,
        sellable: false,
      }),
    ]);
  });
});
