import { describe, expect, it } from "vitest";
import { orderInput } from "../../../../src/modules/orders/orders.schemas.js";

const valid = {
  clientRequestId: "90f2d7c2-2f4f-4de6-9abf-42eaba11e2cf",
  lines: [{ variantId: 4, quantity: 2 }],
  discount: null,
  cashReceived: 500,
};

describe("order schemas", () => {
  it("accepts exact clothing variants with integer quantities", () => {
    expect(orderInput.safeParse(valid).success).toBe(true);
    expect(
      orderInput.safeParse({
        ...valid,
        lines: [{ variantId: 4, quantity: 1.5 }],
      }).success,
    ).toBe(false);
  });
  it("rejects empty carts and invalid discounts", () => {
    expect(orderInput.safeParse({ ...valid, lines: [] }).success).toBe(false);
    expect(
      orderInput.safeParse({
        ...valid,
        discount: { type: "percent", value: 101 },
      }).success,
    ).toBe(false);
  });
  it("requires a valid idempotency UUID", () => {
    expect(
      orderInput.safeParse({ ...valid, clientRequestId: "invalid" }).success,
    ).toBe(false);
  });
});
