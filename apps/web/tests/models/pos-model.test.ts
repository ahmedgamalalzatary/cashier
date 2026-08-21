import { describe, expect, it } from "vitest";
import type { ExternalProduct } from "@cashier/shared";
import {
  addCatalogSelection,
  catalogTilePrice,
  cartTotals,
  defaultExternalSize,
  filterCatalog,
  orderPayload,
  setCartLineQuantity,
} from "../../src/models/pos-model";

const product: ExternalProduct = {
  externalId: 9,
  externalCategoryId: 3,
  nameAr: "لاتيه",
  nameEn: "Latte",
  descriptionAr: null,
  descriptionEn: null,
  imageUrl: null,
  price: "80.00",
  discountPercentage: "10.00",
  discountStart: "2026-08-01T00:00:00",
  discountEnd: "2026-08-31T23:59:59",
  calories: 120,
  pointsReward: 8,
  isAvailable: true,
  isVisible: true,
  ingredients: [],
  stockConfigured: true,
  modifierNamesMissing: false,
  sellable: true,
  sizes: [
    {
      externalId: 91,
      nameAr: "كبير",
      nameEn: "Large",
      price: "100.00",
      isDefault: true,
      ingredients: [{ itemId: 1, quantity: "0.020" }],
    },
  ],
  modifierGroups: [
    {
      externalId: 92,
      nameAr: "إضافات",
      nameEn: "Extras",
      isRequired: false,
      maxSelections: 2,
      options: [
        {
          externalId: 93,
          nameAr: "شوت إضافي",
          nameEn: "Extra shot",
          extraPrice: "15.00",
          stockEffect: "mapped",
          ingredients: [{ itemId: 1, quantity: "0.010" }],
        },
      ],
    },
  ],
};

// The external catalog evaluates discount windows at a fixed UTC+3, so this is
// 2026-08-18T12:00:00 in that catalog's own clock.
const nowMs = Date.parse("2026-08-18T09:00:00Z");

describe("POS model", () => {
  it("adds size/modifier selections and combines identical configurations", () => {
    let cart = addCatalogSelection(
      [],
      product,
      91,
      [{ externalModifierOptionId: 93, quantity: 2 }],
      nowMs,
    );
    cart = addCatalogSelection(
      cart,
      product,
      91,
      [{ externalModifierOptionId: 93, quantity: 2 }],
      nowMs,
    );

    expect(cart).toMatchObject([
      {
        productName: "لاتيه",
        sizeName: "كبير",
        quantity: 2,
        unitPrice: "120.00",
        modifiers: [{ externalModifierOptionId: 93, quantity: 2 }],
      },
    ]);
  });

  it("calculates discounts in integer cents", () => {
    const cart = addCatalogSelection(
      [],
      { ...product, discountPercentage: null },
      91,
      [],
      nowMs,
    );
    const three = setCartLineQuantity(cart, cart[0].key, 3);

    expect(cartTotals(three, { type: "percent", value: 10 }, 300)).toEqual({
      subtotal: 300,
      discountAmount: 30,
      total: 270,
      change: 30,
      hasEnoughCash: true,
      discountValid: true,
    });
  });

  it("filters bilingual products and builds only external-product lines", () => {
    expect(filterCatalog([product], { categoryId: 3, query: "lat" })).toEqual([
      product,
    ]);

    const cart = addCatalogSelection(
      [],
      product,
      91,
      [{ externalModifierOptionId: 93, quantity: 1 }],
      nowMs,
    );
    expect(orderPayload(cart, { type: null, value: 0 }, 200)).toEqual({
      lines: [
        {
          type: "external_product",
          externalProductId: 9,
          externalSizeId: 91,
          quantity: 1,
          modifiers: [{ externalModifierOptionId: 93, quantity: 1 }],
        },
      ],
      discount: null,
      cashReceived: 200,
    });
  });

  it("does not guess when the external catalog marks multiple default sizes", () => {
    expect(defaultExternalSize(product)).toBe(91);
    expect(
      defaultExternalSize({
        ...product,
        sizes: [
          ...product.sizes,
          {
            ...product.sizes[0],
            externalId: 94,
            nameEn: "Medium",
            isDefault: true,
          },
        ],
      }),
    ).toBeNull();
  });

  it("evaluates the discount window at the catalog's fixed UTC+3, not Cairo DST", () => {
    const winter = {
      ...product,
      discountStart: "2026-12-01T10:00:00",
      discountEnd: "2026-12-01T12:00:00",
    };
    // 09:30Z is 12:30 UTC+3 — past the window — but only 11:30 in Cairo
    // winter time, so a DST-aware clock would still discount here.
    const after = addCatalogSelection(
      [],
      winter,
      91,
      [],
      Date.parse("2026-12-01T09:30:00Z"),
    );
    expect(after[0].unitPrice).toBe("100.00");

    const inside = addCatalogSelection(
      [],
      winter,
      91,
      [],
      Date.parse("2026-12-01T08:30:00Z"),
    );
    expect(inside[0].unitPrice).toBe("90.00");
  });

  it("shows a discounted tile price for the default size", () => {
    expect(catalogTilePrice(product, nowMs)).toBe("90.00");
    expect(
      catalogTilePrice({ ...product, discountPercentage: null }, nowMs),
    ).toBe("100.00");
  });

  it("uses explicit-choice fallback pricing when default sizes are ambiguous", () => {
    const ambiguous = {
      ...product,
      sizes: [
        { ...product.sizes[0]!, price: "120.00" },
        {
          ...product.sizes[0]!,
          externalId: 94,
          price: "110.00",
          isDefault: true,
        },
        {
          ...product.sizes[0]!,
          externalId: 95,
          price: "100.00",
          isDefault: false,
        },
      ],
    };

    expect(catalogTilePrice(ambiguous, nowMs)).toBe("90.00");
  });

  it("normalizes duplicate modifiers and rejects invalid quantities", () => {
    const normalized = addCatalogSelection(
      [],
      product,
      91,
      [
        { externalModifierOptionId: 93, quantity: 1 },
        { externalModifierOptionId: 93, quantity: 1 },
      ],
      nowMs,
    );
    expect(normalized[0]).toMatchObject({
      unitPrice: "120.00",
      modifiers: [{ externalModifierOptionId: 93, quantity: 2 }],
    });

    const existing = addCatalogSelection([], product, 91, [], nowMs);
    expect(
      addCatalogSelection(
        existing,
        product,
        91,
        [{ externalModifierOptionId: 93, quantity: 1.5 }],
        nowMs,
      ),
    ).toBe(existing);
  });
});
