import { describe, expect, it } from "vitest";
import { calculateExternalOrderLine } from "../../../../src/modules/orders/external-order-line.js";

const product = {
  externalId: 9,
  nameAr: "لاتيه",
  price: "80.00",
  discountPercentage: "10.00",
  discountStart: "2026-08-01T00:00:00",
  discountEnd: "2026-08-31T23:59:59",
  isAvailable: true,
  isVisible: true,
  isCurrent: true,
  ingredients: [],
  sizes: [
    {
      externalId: 91,
      externalProductId: 9,
      nameAr: "كبير",
      price: "100.00",
      ingredients: [{ itemId: 1, itemName: "بن", quantity: "0.020" }],
    },
  ],
  modifierGroups: [
    {
      externalId: 92,
      nameAr: "إضافات",
      isRequired: true,
      maxSelections: 2,
      options: [
        {
          externalId: 93,
          nameAr: "شوت إضافي",
          extraPrice: "15.00",
          stockEffect: "mapped" as const,
          ingredients: [{ itemId: 1, itemName: "بن", quantity: "0.010" }],
        },
      ],
    },
  ],
};

// The external catalog evaluates discount windows at a fixed UTC+3, so this is
// 2026-08-18T12:00:00 in that catalog's own clock.
const nowMs = Date.parse("2026-08-18T09:00:00Z");

describe("calculateExternalOrderLine", () => {
  it("applies active product discount before modifiers and scales stock", () => {
    const line = calculateExternalOrderLine(
      product,
      {
        externalProductId: 9,
        externalSizeId: 91,
        quantity: 2,
        modifiers: [{ externalModifierOptionId: 93, quantity: 2 }],
      },
      nowMs,
    );

    expect(line.unitPrice).toBe("120.00");
    expect(line.lineSubtotal).toBe("240.00");
    expect(line.consumptions).toEqual([
      { itemId: 1, itemName: "بن", quantity: "0.080" },
    ]);
    expect(line.modifiers).toEqual([
      expect.objectContaining({ externalModifierOptionId: 93, quantity: 2 }),
    ]);
  });

  it("rejects a size owned by another product", () => {
    expect(() =>
      calculateExternalOrderLine(
        product,
        {
          externalProductId: 9,
          externalSizeId: 999,
          quantity: 1,
          modifiers: [{ externalModifierOptionId: 93, quantity: 1 }],
        },
        nowMs,
      ),
    ).toThrow(/المقاس/);
  });

  it("distinguishes missing, invalid, and unsupported sizes", () => {
    const selection = {
      externalProductId: 9,
      quantity: 1,
      modifiers: [{ externalModifierOptionId: 93, quantity: 1 }],
    };

    expect(() =>
      calculateExternalOrderLine(
        product,
        { ...selection, externalSizeId: null },
        nowMs,
      ),
    ).toThrow("يجب اختيار مقاس لهذا المنتج");
    expect(() =>
      calculateExternalOrderLine(
        product,
        { ...selection, externalSizeId: 999 },
        nowMs,
      ),
    ).toThrow("المقاس لا ينتمي إلى المنتج المحدد");
    expect(() =>
      calculateExternalOrderLine(
        {
          ...product,
          sizes: [],
          ingredients: [{ itemId: 1, itemName: "بن", quantity: "0.020" }],
        },
        { ...selection, externalSizeId: 91 },
        nowMs,
      ),
    ).toThrow("هذا المنتج لا يدعم المقاسات");
  });

  it("enforces required groups and maximum selection quantities", () => {
    expect(() =>
      calculateExternalOrderLine(
        product,
        {
          externalProductId: 9,
          externalSizeId: 91,
          quantity: 1,
          modifiers: [],
        },
        nowMs,
      ),
    ).toThrow(/مطلوبة/);
    expect(() =>
      calculateExternalOrderLine(
        product,
        {
          externalProductId: 9,
          externalSizeId: 91,
          quantity: 1,
          modifiers: [{ externalModifierOptionId: 93, quantity: 3 }],
        },
        nowMs,
      ),
    ).toThrow(/الحد الأقصى/);
  });

  it("evaluates the discount window at the catalog's fixed UTC+3, not Cairo DST", () => {
    const winter = {
      ...product,
      discountStart: "2026-12-01T10:00:00",
      discountEnd: "2026-12-01T12:00:00",
      modifierGroups: [],
    };
    const selection = {
      externalProductId: 9,
      externalSizeId: 91,
      quantity: 1,
      modifiers: [],
    };

    // 09:30Z is 12:30 UTC+3 — after the window — while Cairo winter time is
    // still 11:30, so a DST-aware clock would wrongly keep discounting.
    expect(
      calculateExternalOrderLine(
        winter,
        selection,
        Date.parse("2026-12-01T09:30:00Z"),
      ).unitPrice,
    ).toBe("100.00");
    expect(
      calculateExternalOrderLine(
        winter,
        selection,
        Date.parse("2026-12-01T08:30:00Z"),
      ).unitPrice,
    ).toBe("90.00");
  });

  it("refuses to sell a product whose modifiers lost their external names", () => {
    const unnamed = {
      ...product,
      modifierGroups: [
        {
          ...product.modifierGroups[0]!,
          nameAr: null,
          nameEn: null,
        },
      ],
    };

    expect(() =>
      calculateExternalOrderLine(
        unnamed,
        {
          externalProductId: 9,
          externalSizeId: 91,
          quantity: 1,
          modifiers: [{ externalModifierOptionId: 93, quantity: 1 }],
        },
        nowMs,
      ),
    ).toThrow("إضافات المنتج بدون أسماء في الكتالوج الخارجي");
  });
});
