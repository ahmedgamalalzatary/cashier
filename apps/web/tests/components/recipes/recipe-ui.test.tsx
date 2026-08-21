import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  RecipeFlowRail,
  RecipeHeaderActions,
  RecipeMargin,
  RecipeTabs,
} from "../../../src/components/recipes/recipe-controls";
import { CatalogSyncStatus } from "../../../src/components/recipes/catalog-sync-status";
import { Modal } from "../../../src/components/ui/modal";

describe("recipe UI controls", () => {
  it("renders the never-synchronized catalog message", () => {
    const html = renderToStaticMarkup(
      <CatalogSyncStatus
        catalog={{
          categories: [],
          products: [],
          lastSuccessfulSyncAt: null,
          stale: false,
          syncError: null,
        }}
      />,
    );
    expect(html).toContain("لم تتم مزامنة الكتالوج بنجاح بعد");
  });
  it("renders keyboard-addressable tabs with their selected panel relationship", () => {
    const html = renderToStaticMarkup(
      createElement(RecipeTabs, {
        active: "products",
        counts: { products: 3, prepared: 2, preparations: 4 },
        onChange: vi.fn(),
      }),
    );
    expect(html).toContain('role="tablist"');
    expect(html).toContain('id="recipes-products-tab"');
    expect(html).toContain('aria-controls="recipes-products-panel"');
    expect(html).toContain('aria-selected="true"');
  });

  it("expresses the ingredient-to-output-to-cost flow without relying on color", () => {
    const html = renderToStaticMarkup(
      createElement(RecipeFlowRail, {
        ingredientLabel: "2 مكوّن",
        outputLabel: "كبير",
        costLabel: "18.00 ج.م",
        available: false,
      }),
    );
    expect(html).toContain("2 مكوّن");
    expect(html).toContain("كبير");
    expect(html).toContain("18.00 ج.م");
    expect(html).toContain("رصيد غير كافٍ");
  });

  it("keeps prepared-recipe creation and external catalog refresh actions", () => {
    const html = renderToStaticMarkup(
      createElement(RecipeHeaderActions, {
        onPrepared: vi.fn(),
        onRefresh: vi.fn(),
        refreshing: false,
      }),
    );
    expect(html).toContain("إضافة وصفة تحضير");
    expect(html).toContain("تحديث المنتجات");
    expect(html).not.toContain("إضافة منتج وصفة");
  });

  it("allows the dense recipe editor to use a wide, scroll-safe dialog", () => {
    const html = renderToStaticMarkup(
      <Modal title="تحرير وصفة" open onClose={vi.fn()} size="xl">
        <p>المكوّنات</p>
      </Modal>,
    );
    expect(html).toContain("max-w-4xl");
    expect(html).toContain("max-h-[calc(100dvh-2rem)]");
  });

  it("shows cost percentage and marks a negative margin as a loss", () => {
    const html = renderToStaticMarkup(
      <RecipeMargin
        marginAmount="-2.35"
        marginPercentage="-23.50"
        costPercentage="123.50"
      />,
    );
    expect(html).toContain("نسبة التكلفة 123.50%");
    expect(html).toContain("هامش");
    expect(html).toContain("text-danger");
    expect(html).not.toContain("text-success");
  });
});
