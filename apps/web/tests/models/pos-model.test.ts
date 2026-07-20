import { describe, expect, it } from "vitest";
import type { PosCatalogProduct } from "@cashier/shared";
import {
  addCatalogSelection,
  cartTotals,
  filterCatalog,
  orderPayload,
  setCartLineQuantity,
} from "../../src/models/pos-model";

const catalog: PosCatalogProduct[] = [
  {
    type: "recipe",
    recipeId: 1,
    name: "لاتيه",
    categoryId: 11,
    mainCategoryId: 10,
    mainCategoryName: "مشروبات",
    subCategoryId: 11,
    subCategoryName: "قهوة",
    sizes: [
      { id: 101, name: "صغير", sellingPrice: "30.00" },
      { id: 102, name: "كبير", sellingPrice: "40.00" },
    ],
  },
  {
    type: "item",
    itemId: 2,
    name: "مياه",
    categoryId: 12,
    mainCategoryId: 10,
    mainCategoryName: "مشروبات",
    subCategoryId: 12,
    subCategoryName: "بارد",
    sellingPrice: "10.00",
    stockUnit: "زجاجة",
  },
];

describe("POS model", () => {
  it("adds size-aware selections and combines repeated cart keys", () => {
    let cart = addCatalogSelection([], catalog[0], 102);
    cart = addCatalogSelection(cart, catalog[0], 102);
    cart = addCatalogSelection(cart, catalog[1]);

    expect(cart).toMatchObject([
      {
        key: "recipe:102",
        productName: "لاتيه",
        sizeName: "كبير",
        quantity: 2,
        unitPrice: "40.00",
      },
      {
        key: "item:2",
        productName: "مياه",
        quantity: 1,
        unitPrice: "10.00",
      },
    ]);
  });

  it("calculates percentage and fixed discounts in integer cents", () => {
    const cart = [
      {
        key: "recipe:101",
        type: "recipe" as const,
        recipeSizeId: 101,
        productName: "لاتيه",
        sizeName: "صغير",
        stockUnit: null,
        quantity: 3,
        unitPrice: "33.35",
      },
    ];

    expect(cartTotals(cart, { type: "percent", value: 10 }, 100)).toEqual({
      subtotal: 100.05,
      discountAmount: 10.01,
      total: 90.04,
      change: 9.96,
      hasEnoughCash: true,
      discountValid: true,
    });
    expect(cartTotals(cart, { type: "fixed", value: 101 }, 101)).toMatchObject({
      discountValid: false,
    });
  });

  it("rounds fractional resale totals exactly like the server", () => {
    expect(
      cartTotals(
        [
          {
            key: "item:9",
            type: "item",
            itemId: 9,
            productName: "وزن",
            sizeName: null,
            stockUnit: "كجم",
            quantity: 1.005,
            unitPrice: "1.00",
          },
        ],
        { type: null, value: 0 },
        1.01,
      ),
    ).toMatchObject({
      subtotal: 1.01,
      total: 1.01,
      hasEnoughCash: true,
    });
  });

  it("rejects oversized exponential numeric inputs without throwing", () => {
    const oversizedCart = [
      {
        key: "item:8",
        type: "item" as const,
        itemId: 8,
        productName: "مياه",
        sizeName: null,
        stockUnit: "وحدة",
        quantity: 1e21,
        unitPrice: "10.00",
      },
    ];

    expect(() =>
      cartTotals(oversizedCart, { type: null, value: 0 }, 1e21),
    ).not.toThrow();
    expect(
      cartTotals(oversizedCart, { type: null, value: 0 }, 1e21),
    ).toMatchObject({ hasEnoughCash: false, discountValid: false });
  });

  it("filters by category and Arabic query, normalizes quantities, and builds the API body", () => {
    expect(
      filterCatalog(catalog, {
        mainCategoryId: 10,
        subCategoryId: 11,
        query: "لات",
      }),
    ).toEqual([catalog[0]]);

    let cart = addCatalogSelection([], catalog[1]);
    cart = setCartLineQuantity(cart, "item:2", 1.2344);
    expect(cart[0].quantity).toBe(1.234);
    expect(orderPayload(cart, { type: "fixed", value: 2 }, 20)).toEqual({
      lines: [{ type: "item", itemId: 2, quantity: 1.234 }],
      discount: { type: "fixed", value: 2 },
      cashReceived: 20,
    });
  });
});
