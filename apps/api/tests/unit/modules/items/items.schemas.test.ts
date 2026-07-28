import { describe, expect, it } from "vitest";
import {
  itemInput,
  itemUpdateInput,
} from "../../../../src/modules/items/items.schemas.js";

const validProduct = {
  name: "تي شيرت قطن",
  categoryId: 1,
  variants: [
    { colorId: 2, sizeId: 3, barcode: "6221234567890", sellingPrice: 250 },
  ],
} as const;

describe("product schemas", () => {
  it("accepts independently priced color-size variants", () => {
    const parsed = itemInput.parse(validProduct);
    expect(parsed.variants[0]).toEqual(validProduct.variants[0]);
  });

  it("requires at least one variant and rejects duplicate combinations", () => {
    expect(
      itemInput.safeParse({ ...validProduct, variants: [] }).success,
    ).toBe(false);
    expect(
      itemInput.safeParse({
        ...validProduct,
        variants: [
          validProduct.variants[0],
          { ...validProduct.variants[0], barcode: "DIFFERENT" },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate non-empty barcodes and invalid selling prices", () => {
    expect(
      itemInput.safeParse({
        ...validProduct,
        variants: [
          validProduct.variants[0],
          {
            colorId: 4,
            sizeId: 3,
            barcode: validProduct.variants[0].barcode,
            sellingPrice: 200,
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      itemInput.safeParse({
        ...validProduct,
        variants: [{ colorId: 2, sizeId: 3, sellingPrice: 20.555 }],
      }).success,
    ).toBe(false);
  });

  it("rejects an empty update and permits reactivation only", () => {
    expect(() => itemUpdateInput.parse({})).toThrow();
    expect(itemUpdateInput.safeParse({ isActive: true }).success).toBe(true);
    expect(itemUpdateInput.safeParse({ isActive: false }).success).toBe(false);
  });
});
