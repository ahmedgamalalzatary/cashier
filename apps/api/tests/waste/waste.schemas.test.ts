import { describe, expect, it } from "vitest";
import { wasteInput } from "../../src/modules/waste/waste.schemas.js";

describe("waste input", () => {
  const base = {
    clientRequestId: crypto.randomUUID(),
    warehouse: "cafe",
    target: { type: "item", itemId: 1 },
    quantity: 1,
    reason: "damaged",
    note: null,
  };

  it("accepts item and external-product waste targets", () => {
    expect(wasteInput.parse(base).target).toEqual({ type: "item", itemId: 1 });
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

  it("requires a note for the other reason", () => {
    expect(() =>
      wasteInput.parse({ ...base, reason: "other", note: " " }),
    ).toThrow();
  });

  it("coerces numeric strings like sibling modules", () => {
    const parsed = wasteInput.parse({
      ...base,
      target: { type: "item", itemId: "1" },
      quantity: "5",
    });
    expect(parsed.quantity).toBe(5);
    expect(parsed.target).toEqual({ type: "item", itemId: 1 });
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
  });
});
