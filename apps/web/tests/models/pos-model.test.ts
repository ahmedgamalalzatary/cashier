import { describe, expect, it } from "vitest";
import type { PosCatalogProduct } from "@cashier/shared";
import {
  addCatalogSelection,
  filterCatalog,
  orderPayload,
} from "../../src/models/pos-model";

const variant: PosCatalogProduct = {
  variantId: 11,
  productId: 3,
  code: 42,
  barcode: "622123",
  productName: "تي شيرت",
  colorId: 2,
  colorName: "أسود",
  sizeId: 4,
  sizeName: "L",
  categoryId: 1,
  mainCategoryId: 1,
  mainCategoryName: "ملابس",
  subCategoryId: null,
  subCategoryName: null,
  sellingPrice: "250.00",
};

describe("clothing POS model", () => {
  it("adds and combines the exact color-size variant", () => {
    const once = addCatalogSelection([], variant);
    const twice = addCatalogSelection(once, variant);
    expect(twice).toEqual([
      expect.objectContaining({ variantId: 11, quantity: 2 }),
    ]);
  });

  it("finds variants by barcode, color, or size", () => {
    expect(
      filterCatalog([variant], {
        mainCategoryId: null,
        subCategoryId: null,
        query: "622123",
      }),
    ).toHaveLength(1);
    expect(
      filterCatalog([variant], {
        mainCategoryId: null,
        subCategoryId: null,
        query: "أسود L",
      }),
    ).toHaveLength(1);
  });

  it("submits variantId to the order API", () => {
    const cart = addCatalogSelection([], variant);
    expect(orderPayload(cart, { type: null, value: 0 }, 300).lines).toEqual([
      { variantId: 11, quantity: 1 },
    ]);
  });
});
