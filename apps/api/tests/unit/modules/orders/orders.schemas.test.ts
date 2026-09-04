import { describe, expect, it } from "vitest";
import { orderInput } from "../../../../src/modules/orders/orders.schemas.js";

const valid = {
  clientRequestId: "3f7797a2-16a4-4dd9-bd42-dd3f75af5d7a",
  lines: [
    {
      type: "external_product",
      externalProductId: 9,
      externalSizeId: 91,
      quantity: 1,
      modifiers: [{ externalModifierOptionId: 93, quantity: 2 }],
    },
  ],
  cashReceived: 50,
};

describe("order schemas", () => {
  it("accepts external products, sizes, modifier quantities, and discounts", () => {
    expect(orderInput.safeParse(valid).success).toBe(true);
    expect(
      orderInput.safeParse({
        ...valid,
        lines: [
          {
            type: "external_product",
            externalProductId: 10,
            externalSizeId: null,
            quantity: 2,
            modifiers: [],
          },
        ],
        discount: { type: "fixed", value: 2.5 },
        cashReceived: 20,
      }).success,
    ).toBe(true);
  });

  it("rejects empty carts, fractional product counts, duplicate modifiers, and over-100 percent discounts", () => {
    expect(orderInput.safeParse({ ...valid, lines: [] }).success).toBe(false);
    expect(
      orderInput.safeParse({
        ...valid,
        lines: [
          {
            type: "external_product",
            externalProductId: 9,
            externalSizeId: null,
            quantity: 1.5,
            modifiers: [],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      orderInput.safeParse({
        ...valid,
        lines: [
          {
            type: "external_product",
            externalProductId: 9,
            externalSizeId: null,
            quantity: 1,
            modifiers: [
              { externalModifierOptionId: 93, quantity: 1 },
              { externalModifierOptionId: 93, quantity: 1 },
            ],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      orderInput.safeParse({
        ...valid,
        discount: { type: "percent", value: 100.01 },
      }).success,
    ).toBe(false);
  });

  it("rejects money with more than two decimal places", () => {
    expect(
      orderInput.safeParse({ ...valid, cashReceived: 50.001 }).success,
    ).toBe(false);
  });

  it("requires a valid client idempotency UUID", () => {
    const { clientRequestId: _clientRequestId, ...withoutRequestId } = valid;
    expect(orderInput.safeParse(withoutRequestId).success).toBe(false);
    expect(
      orderInput.safeParse({ ...valid, clientRequestId: "not-a-uuid" }).success,
    ).toBe(false);
  });
});
