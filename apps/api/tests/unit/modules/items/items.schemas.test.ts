import { describe, expect, it } from "vitest";
import {
  itemInput,
  itemUpdateInput,
} from "../../../../src/modules/items/items.schemas.js";

const validItem = {
  name: "بن برازيلي",
  categoryId: 1,
  type: "raw",
  stockUnit: "كجم",
  mainMinimumLevel: 2,
  cafeMinimumLevel: 1,
} as const;

describe("item schemas", () => {
  it("accepts an item with stock and purchase units", () => {
    const parsed = itemInput.parse({
      ...validItem,
      purchaseUnit: "شيكارة",
      purchaseToStockFactor: 25,
    });

    expect(parsed.purchaseUnit).toBe("شيكارة");
    expect(parsed.purchaseToStockFactor).toBe(25);
  });

  it("requires a conversion factor when a purchase unit is supplied", () => {
    expect(() =>
      itemInput.parse({ ...validItem, purchaseUnit: "شيكارة" }),
    ).toThrow();
  });

  it("rejects a conversion factor without a purchase unit", () => {
    expect(() =>
      itemInput.parse({ ...validItem, purchaseToStockFactor: 12 }),
    ).toThrow();
  });

  it("rejects quantities with more than three decimal places", () => {
    expect(() =>
      itemInput.parse({ ...validItem, mainMinimumLevel: 0.0001 }),
    ).toThrow();
  });

  it("rejects an empty update", () => {
    expect(() => itemUpdateInput.parse({})).toThrow();
  });

  it("allows reactivation but rejects deactivation through PUT", () => {
    expect(itemUpdateInput.safeParse({ isActive: true }).success).toBe(true);
    expect(itemUpdateInput.safeParse({ isActive: false }).success).toBe(false);
  });

  it("requires a positive two-decimal selling price for resale items", () => {
    expect(itemInput.safeParse({ ...validItem, type: "resale" }).success).toBe(
      false,
    );
    expect(
      itemInput.safeParse({
        ...validItem,
        type: "resale",
        sellingPrice: 27.5,
      }).success,
    ).toBe(true);
    expect(
      itemInput.safeParse({
        ...validItem,
        type: "resale",
        sellingPrice: 27.555,
      }).success,
    ).toBe(false);
  });

  it("allows selling-price updates for existing resale items", () => {
    expect(itemUpdateInput.safeParse({ sellingPrice: 31.25 }).success).toBe(
      true,
    );
  });

  it("rejects a selling price on raw and prepared items", () => {
    expect(
      itemInput.safeParse({ ...validItem, sellingPrice: 20 }).success,
    ).toBe(false);
    expect(
      itemInput.safeParse({
        ...validItem,
        type: "prepared",
        sellingPrice: 20,
      }).success,
    ).toBe(false);
  });
});
