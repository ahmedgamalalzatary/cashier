import { testId } from "@cashier/shared/test-support";
import { describe, expect, it } from "vitest";
import { wasteInput } from "../../src/modules/waste/waste.schemas.js";

describe("waste input", () => {
  const base = {
    clientRequestId: crypto.randomUUID(),
    warehouse: "cafe",
    target: { type: "item", itemId: testId(1) },
    quantity: 1,
    reason: "damaged",
    note: null,
  };

  it("accepts item and external-product waste targets", () => {
    expect(wasteInput.parse(base).target).toEqual({ type: "item", itemId: testId(1) });
    expect(
      wasteInput.parse({
        ...base,
        target: {
          type: "external_product",
          externalProductId: 9,
          externalSizeId: 91,
        },
        reason: "spill",
      }).target,
    ).toEqual({
      type: "external_product",
      externalProductId: 9,
      externalSizeId: 91,
    });
  });

  it("accepts recipe waste targets with integer quantity", () => {
    expect(
      wasteInput.parse({
        ...base,
        target: { type: "recipe", recipeId: testId(3), recipeSizeId: testId(7) },
        quantity: 2,
      }).target,
    ).toEqual({ type: "recipe", recipeId: testId(3), recipeSizeId: testId(7) });
  });

  it("requires a note for the other reason", () => {
    expect(() =>
      wasteInput.parse({ ...base, reason: "other", note: " " }),
    ).toThrow();
  });

  it("preserves UUID ids while coercing quantity strings", () => {
    const parsed = wasteInput.parse({
      ...base,
      target: { type: "item", itemId: testId(1) },
      quantity: "5",
    });
    expect(parsed.quantity).toBe(5);
    expect(parsed.target).toEqual({ type: "item", itemId: testId(1) });
  });

  it("rejects fractional external-product quantities", () => {
    expect(() =>
      wasteInput.parse({
        ...base,
        target: {
          type: "external_product",
          externalProductId: 9,
          externalSizeId: null,
        },
        quantity: 0.5,
      }),
    ).toThrow();
  });

  it("rejects fractional recipe quantities", () => {
    expect(() =>
      wasteInput.parse({
        ...base,
        target: { type: "recipe", recipeId: testId(3), recipeSizeId: testId(7) },
        quantity: 1.5,
      }),
    ).toThrow();
  });

  it("rejects booleans instead of coercing them to 0/1", () => {
    expect(() =>
      wasteInput.parse({ ...base, quantity: true }),
    ).toThrow();
    expect(() =>
      wasteInput.parse({
        ...base,
        target: { type: "item", itemId: true },
      }),
    ).toThrow();
    expect(() =>
      wasteInput.parse({
        ...base,
        target: {
          type: "external_product",
          externalProductId: true,
          externalSizeId: 91,
        },
      }),
    ).toThrow();
    expect(() =>
      wasteInput.parse({
        ...base,
        target: {
          type: "external_product",
          externalProductId: 9,
          externalSizeId: false,
        },
      }),
    ).toThrow();
    expect(() =>
      wasteInput.parse({
        ...base,
        target: { type: "recipe", recipeId: true, recipeSizeId: testId(7) },
      }),
    ).toThrow();
  });
});
