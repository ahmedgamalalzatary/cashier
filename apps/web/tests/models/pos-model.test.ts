import { describe, expect, it } from "vitest";
import type { CurrentShift, ExternalProduct } from "@cashier/shared";
import * as posModel from "../../src/models/pos-model";
import {
  addCatalogSelection,
  cartLineTotal,
  catalogSizePrice,
  catalogTilePrice,
  cartTotals,
  defaultExternalSize,
  filterCatalog,
  isOwnOpenShift,
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
  it("adds a local product independently of an imported product with the same id", () => {
    const item = {
      id: 9,
      name: "تركي سنجل",
      categoryId: 2,
      sellingPrice: "35.00",
      stockUnit: "فنجان",
    };
    const imported = addCatalogSelection(
      [],
      product,
      91,
      [],
      new Date("2026-09-28").getTime(),
    );
    const once = posModel.addLocalSelection(imported, item);
    const twice = posModel.addLocalSelection(once, item);
    expect(
      twice.map((line) => [line.type, line.quantity, line.unitPrice]),
    ).toEqual([
      ["external_product", 1, "100.00"],
      ["item", 2, "35.00"],
    ]);
    expect(orderPayload(twice, { type: null, value: 0 }, 200).lines).toEqual([
      {
        type: "external_product",
        externalProductId: 9,
        externalSizeId: 91,
        quantity: 1,
        modifiers: [],
      },
      { type: "item", itemId: 9, quantity: 2 },
    ]);
  });

  it("browses main-category descendants and a selected subcategory, with search", () => {
    const categories = [
      { id: 1, name: "مشروبات", parentId: null },
      { id: 2, name: "قهوة", parentId: 1 },
      { id: 3, name: "حلويات", parentId: null },
    ];
    const items = [
      {
        id: 10,
        name: "تركي",
        categoryId: 2,
        sellingPrice: "35.00",
        stockUnit: "فنجان",
      },
      {
        id: 11,
        name: "شاي",
        categoryId: 1,
        sellingPrice: "30.00",
        stockUnit: "كوب",
      },
      {
        id: 12,
        name: "كيك",
        categoryId: 3,
        sellingPrice: "80.00",
        stockUnit: "قطعة",
      },
    ];
    expect(
      posModel
        .filterLocalCatalog(items, categories, {
          mainCategoryId: 1,
          subCategoryId: null,
          query: "",
        })
        .map((item) => item.id),
    ).toEqual([10, 11]);
    expect(
      posModel
        .filterLocalCatalog(items, categories, {
          mainCategoryId: 1,
          subCategoryId: 2,
          query: "",
        })
        .map((item) => item.id),
    ).toEqual([10]);
    expect(
      posModel
        .filterLocalCatalog(items, categories, {
          mainCategoryId: null,
          subCategoryId: null,
          query: " كيك ",
        })
        .map((item) => item.id),
    ).toEqual([12]);
  });
  it("sends local resale lines with their identity and charges their selling price", () => {
    const cart = [
      {
        key: "item:9",
        type: "item" as const,
        itemId: 9,
        productName: "تركي سنجل",
        sizeName: null,
        quantity: 2,
        unitPrice: "35.00",
        modifiers: [],
      },
    ];
    expect(orderPayload(cart as never, { type: null, value: 0 }, 100)).toEqual({
      lines: [{ type: "item", itemId: 9, quantity: 2 }],
      discount: null,
      cashReceived: 100,
    });
    expect(
      cartTotals(cart as never, { type: null, value: 0 }, 100),
    ).toMatchObject({ subtotal: 70, total: 70, change: 30 });
  });
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

  it("shows the same discounted price on a size button as the cart will charge", () => {
    expect(catalogSizePrice(product, product.sizes[0]!, nowMs)).toBe("90.00");
    expect(
      catalogSizePrice(
        { ...product, discountPercentage: null },
        product.sizes[0]!,
        nowMs,
      ),
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

  it("totals cart lines with exact decimal math", () => {
    const line = {
      key: "k",
      type: "external_product" as const,
      externalProductId: 9,
      externalSizeId: 91,
      productName: "لاتيه",
      sizeName: "كبير",
      quantity: 3,
      unitPrice: "10.10",
      modifiers: [],
    };
    // Number("10.10") * 3 === 30.299999999999997 in floating point.
    expect(cartLineTotal(line)).toBe("30.30");
    expect(cartLineTotal({ ...line, unitPrice: "19.99" })).toBe("59.97");
  });

  it("recognizes only the cashier's own open shift", () => {
    const shift = { cashierUserId: 5 } as unknown as CurrentShift;
    const cashier = { id: 5, role: "cashier" };

    expect(isOwnOpenShift(shift, cashier)).toBe(true);
    expect(isOwnOpenShift(shift, { id: 6, role: "cashier" })).toBe(false);
    expect(isOwnOpenShift(shift, { id: 5, role: "admin" })).toBe(false);
    expect(isOwnOpenShift(null, cashier)).toBe(false);
    expect(isOwnOpenShift(shift, null)).toBe(false);
  });
});
