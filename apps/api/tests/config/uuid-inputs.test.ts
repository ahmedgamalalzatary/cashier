import { describe, expect, it } from "vitest";
import { idParam } from "@cashier/server-core";
import { itemInput } from "../../src/modules/items/items.schemas.js";
import { orderInput } from "../../src/modules/orders/orders.schemas.js";

const uuid = "019a1234-5678-7000-8000-000000000001";

describe("business UUID input contracts", () => {
  it("accepts UUID route IDs and rejects counter IDs", () => {
    expect(idParam.safeParse(uuid).success).toBe(true);
    expect(idParam.safeParse("1").success).toBe(false);
  });
  it("accepts a UUID category when creating an item", () => {
    expect(itemInput.safeParse({ name: "Milk", categoryId: uuid, type: "raw", stockUnit: "litre" }).success).toBe(true);
  });
  it("keeps external-system IDs numeric while accepting UUID local items", () => {
    const parsed = orderInput.safeParse({
      clientRequestId: uuid,
      lines: [
        { type: "item", itemId: uuid, quantity: 1 },
        { type: "external_product", externalProductId: 1, externalSizeId: null, quantity: 1, modifiers: [] },
      ], cashReceived: 100,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.lines[1]).toMatchObject({ externalProductId: 1 });
  });
});
