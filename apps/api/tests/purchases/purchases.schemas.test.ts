import { describe, expect, it } from "vitest";
import { purchaseInput } from "../../src/modules/purchases/purchases.schemas.js";

const validLine = {
  itemId: 5,
  quantity: 2.5,
  unitMode: "stock",
  unitPrice: 10.25,
} as const;

const validPurchase = {
  clientRequestId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  supplierId: 1,
  invoiceNumber: "INV-1",
  purchasedAt: "2026-07-20",
  paidAmount: 10,
  notes: null,
  lines: [{ ...validLine }],
};

describe("purchase schema", () => {
  it("accepts a valid invoice and defaults paid amount to zero", () => {
    const { paidAmount, ...withoutPaid } = validPurchase;

    expect(purchaseInput.parse(validPurchase).lines).toHaveLength(1);
    expect(purchaseInput.parse(withoutPaid).paidAmount).toBe(0);
    void paidAmount;
  });

  it("blanks invoice numbers and notes to null", () => {
    const parsed = purchaseInput.parse({
      ...validPurchase,
      invoiceNumber: "   ",
      notes: "",
    });

    expect(parsed.invoiceNumber).toBeNull();
    expect(parsed.notes).toBeNull();
  });

  it("rejects a duplicate item in the lines", () => {
    const result = purchaseInput.safeParse({
      ...validPurchase,
      lines: [{ ...validLine }, { ...validLine, quantity: 1 }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "لا يمكن تكرار الصنف في الفاتورة",
      );
    }
  });

  it("rejects bad dates, quantities, prices, and modes", () => {
    expect(
      purchaseInput.safeParse({ ...validPurchase, purchasedAt: "2026-02-30" })
        .success,
    ).toBe(false);
    expect(
      purchaseInput.safeParse({ ...validPurchase, purchasedAt: "20-07-2026" })
        .success,
    ).toBe(false);
    expect(
      purchaseInput.parse({ ...validPurchase, purchasedAt: "2028-02-29" })
        .purchasedAt,
    ).toBe("2028-02-29");

    const lineCases: Array<Record<string, unknown>> = [
      { quantity: 1.0005 },
      { quantity: 0 },
      { unitPrice: 10.255 },
      { unitPrice: -1 },
      { unitMode: "box" },
      { itemId: 0 },
    ];
    for (const patch of lineCases) {
      expect(
        purchaseInput.safeParse({
          ...validPurchase,
          lines: [{ ...validLine, ...patch }],
        }).success,
        JSON.stringify(patch),
      ).toBe(false);
    }
  });

  it("rejects empty lines and coerces string ids", () => {
    expect(
      purchaseInput.safeParse({ ...validPurchase, lines: [] }).success,
    ).toBe(false);
    const parsed = purchaseInput.parse({
      ...validPurchase,
      supplierId: "1",
      lines: [{ ...validLine, itemId: "5" }],
    });
    expect(parsed.supplierId).toBe(1);
    expect(parsed.lines[0]?.itemId).toBe(5);
  });
});
