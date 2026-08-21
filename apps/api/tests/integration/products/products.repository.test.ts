import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { categories, items } from "../../../src/db/schema.js";
import type { ExternalCatalog } from "../../../src/modules/external/external-catalog.client.js";
import { ProductsRepository } from "../../../src/modules/products/products.repository.js";
import { db, nextTestItemCode } from "../../support/setup.js";

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

describe("ProductsRepository catalog reconciliation", () => {
  it("preserves local stock setup across refreshes and hides missing upstream products", async () => {
    const [category] = await db.insert(categories).values({ name: "مخزون" });
    const [ingredient] = await db.insert(items).values({
      code: nextTestItemCode(),
      name: "بن",
      categoryId: category.insertId,
      type: "raw",
      stockUnit: "كجم",
    });
    const repository = new ProductsRepository(db);
    await repository.applyCatalog(catalog());
    await repository.saveStockSetup(9, {
      baseIngredients: [{ itemId: ingredient.insertId, quantity: 0.02 }],
      sizes: [],
      modifiers: [
        { externalModifierOptionId: 93, stockEffect: "none" },
      ],
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
            itemId: ingredient.insertId,
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
      await db.select().from(items).where(eq(items.id, ingredient.insertId)),
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

  it("caches a product with unnamed modifiers but keeps it out of sale", async () => {
    const [category] = await db.insert(categories).values({ name: "مخزون" });
    const [ingredient] = await db.insert(items).values({
      code: nextTestItemCode(),
      name: "بن",
      categoryId: category.insertId,
      type: "raw",
      stockUnit: "كجم",
    });
    const repository = new ProductsRepository(db);
    const unnamed = catalog();
    unnamed.products[0]!.modifierGroups[0]!.nameAr = null;
    unnamed.products[0]!.modifierGroups[0]!.nameEn = null;
    unnamed.products[0]!.modifierGroups[0]!.options[0]!.nameAr = null;
    unnamed.products[0]!.modifierGroups[0]!.options[0]!.nameEn = null;

    await repository.applyCatalog(unnamed);
    await repository.saveStockSetup(9, {
      baseIngredients: [{ itemId: ingredient.insertId, quantity: 0.02 }],
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
