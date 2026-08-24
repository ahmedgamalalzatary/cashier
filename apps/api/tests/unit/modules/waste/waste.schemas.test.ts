import { describe, expect, it } from "vitest";
import { wasteInput } from "../../../../src/modules/waste/waste.schemas.js";

describe("waste input", () => {
  const base = {
    clientRequestId: crypto.randomUUID(),
    warehouse: "cafe",
    target: { type: "item", itemId: 1 },
    quantity: 1,
    reason: "damaged",
    note: null,
  };

  it("accepts item and recipe-size waste targets", () => {
    expect(wasteInput.parse(base).target).toEqual({ type: "item", itemId: 1 });
    expect(
      wasteInput.parse({
        ...base,
        target: { type: "recipe", recipeSizeId: 2 },
        reason: "spill",
      }).target,
    ).toEqual({ type: "recipe", recipeSizeId: 2 });
  });

  it("requires a note for the other reason", () => {
    expect(() =>
      wasteInput.parse({ ...base, reason: "other", note: " " }),
    ).toThrow();
  });

  it("rejects fractional recipe-product quantities", () => {
    expect(() =>
      wasteInput.parse({
        ...base,
        target: { type: "recipe", recipeSizeId: 2 },
        quantity: 0.5,
      }),
    ).toThrow();
  });
});
