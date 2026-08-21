import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ExternalProduct } from "@cashier/shared";
import { ExternalProductCard } from "../../../src/components/recipes/external-product-card";
import { ProductStockSetupModal } from "../../../src/components/recipes/product-stock-setup-modal";
import { formatMoney } from "../../../src/lib/format";

const product: ExternalProduct = {
  externalId: 9,
  externalCategoryId: 3,
  nameAr: "لاتيه",
  nameEn: "Latte",
  descriptionAr: "قهوة بالحليب",
  descriptionEn: "Coffee with milk",
  imageUrl: null,
  price: "80.00",
  discountPercentage: "10.00",
  discountStart: "2026-08-01T00:00:00",
  discountEnd: "2026-08-31T23:59:59",
  calories: 120,
  pointsReward: 8,
  isAvailable: true,
  isVisible: true,
  ingredients: [],
  sizes: [
    {
      externalId: 91,
      nameAr: "كبير",
      nameEn: "Large",
      price: "100.00",
      isDefault: true,
      ingredients: [],
    },
  ],
  modifierGroups: [
    {
      externalId: 92,
      nameAr: "الإضافات",
      nameEn: "Extras",
      isRequired: true,
      maxSelections: 2,
      options: [
        {
          externalId: 93,
          nameAr: "شوت إضافي",
          nameEn: "Extra shot",
          extraPrice: "15.00",
          stockEffect: "incomplete",
          ingredients: [],
        },
      ],
    },
  ],
  stockConfigured: false,
  modifierNamesMissing: false,
  sellable: false,
};

describe("ExternalProductCard", () => {
  it("shows synchronized details with stock setup as its only edit action", () => {
    const html = renderToStaticMarkup(
      <ExternalProductCard
        product={product}
        categoryName="مشروبات / Drinks"
        onStockSetup={vi.fn()}
      />,
    );

    expect(html).toContain("لاتيه");
    expect(html).toContain("Latte");
    expect(html).toContain("Coffee with milk");
    expect(html).toContain("Large");
    expect(html).toContain(formatMoney("100.00"));
    expect(html).toContain("Extras");
    expect(html).toContain("Extra shot");
    expect(html).toContain(formatMoney("15.00"));
    expect(html).toContain("فترة الخصم");
    expect(html).toContain("إعداد المخزون");
    expect(html).not.toContain("تعديل المنتج");
    expect(html).not.toContain("حذف");
  });

  it("explains that a product is held out of sale by unnamed external modifiers", () => {
    const html = renderToStaticMarkup(
      <ExternalProductCard
        product={{
          ...product,
          stockConfigured: true,
          modifierNamesMissing: true,
          sellable: false,
          modifierGroups: [
            {
              ...product.modifierGroups[0]!,
              nameAr: null,
              nameEn: null,
              options: [
                {
                  ...product.modifierGroups[0]!.options[0]!,
                  nameAr: null,
                  nameEn: null,
                },
              ],
            },
          ],
        }}
        categoryName="مشروبات / Drinks"
        onStockSetup={vi.fn()}
      />,
    );

    expect(html).toContain("أسماء الإضافات مفقودة في الكتالوج الخارجي");
    // A bare external ID is meaningless to staff, so it must never be shown
    // as a stand-in for the missing name.
    expect(html).not.toContain("93");
  });

  it("labels an unnamed modifier in stock setup without exposing its ID", () => {
    const html = renderToStaticMarkup(
      <ProductStockSetupModal
        product={{
          ...product,
          modifierNamesMissing: true,
          sellable: false,
          modifierGroups: [
            {
              ...product.modifierGroups[0]!,
              nameAr: null,
              nameEn: null,
              options: [
                {
                  ...product.modifierGroups[0]!.options[0]!,
                  nameAr: null,
                  nameEn: null,
                },
              ],
            },
          ],
        }}
        items={[]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    expect(html).toContain("إضافة بدون اسم");
    expect(html).not.toContain("null");
  });
  it("retains inactive items referenced by existing stock mappings", () => {
    const html = renderToStaticMarkup(
      <ProductStockSetupModal
        product={{
          ...product,
          sizes: [
            {
              ...product.sizes[0]!,
              ingredients: [{ itemId: 7, quantity: "0.020" }],
            },
          ],
        }}
        items={[
          {
            id: 7,
            code: 7,
            name: "قديم",
            categoryId: 1,
            categoryName: "خامات",
            type: "raw",
            sellingPrice: null,
            stockUnit: "كجم",
            purchaseUnit: "كجم",
            purchaseToStockFactor: "1.000000",
            mainMinimumLevel: "0.000",
            cafeMinimumLevel: "0.000",
            hasStockHistory: true,
            isActive: false,
            createdAt: "2026-08-01T00:00:00.000Z",
          },
        ]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    expect(html).toContain("قديم");
  });
});
