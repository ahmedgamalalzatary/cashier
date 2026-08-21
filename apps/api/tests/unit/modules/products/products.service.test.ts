import { describe, expect, it, vi } from "vitest";
import { ProductsService } from "../../../../src/modules/products/products.service.js";

const catalog = {
  categories: [
    {
      externalId: 3,
      nameAr: "مشروبات",
      nameEn: "Drinks",
      descriptionAr: null,
      descriptionEn: null,
      isActive: true,
      isVisible: true,
      displayOrder: 1,
    },
  ],
  products: [],
};

describe("ProductsService", () => {
  it("serves only the local cache without an external dependency", async () => {
    const cached = {
      categories: catalog.categories,
      products: [],
      lastSuccessfulSyncAt: new Date("2026-08-18T10:00:00Z"),
    };
    const repository = {
      getCatalog: vi.fn().mockResolvedValue(cached),
    };
    const result = await new ProductsService(repository).list();
    expect(result).toMatchObject({
      products: [],
      stale: false,
      syncError: null,
    });
  });

  it("blocks catalog use when no successful cache exists", async () => {
    const repository = {
      getCatalog: vi.fn().mockResolvedValue(null),
    };
    await expect(new ProductsService(repository).list()).rejects.toMatchObject({
      status: 503,
    });
  });

  it("requires complete size and modifier setup for the selected product", async () => {
    const repository = {
      applyCatalog: vi.fn(),
      recordSyncFailure: vi.fn(),
      getCatalog: vi.fn(),
      getStockTargets: vi.fn().mockResolvedValue({
        exists: true,
        sizeIds: [91, 92],
        modifierOptionIds: [101],
      }),
      saveStockSetup: vi.fn(),
    };
    const service = new ProductsService(repository);

    await expect(
      service.configureStock(9, {
        baseIngredients: [],
        sizes: [
          {
            externalSizeId: 91,
            ingredients: [{ itemId: 1, quantity: 1 }],
          },
        ],
        modifiers: [{ externalModifierOptionId: 101, stockEffect: "none" }],
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(repository.saveStockSetup).not.toHaveBeenCalled();
  });

  it("rejects a size or modifier that belongs to another product", async () => {
    const repository = {
      applyCatalog: vi.fn(),
      recordSyncFailure: vi.fn(),
      getCatalog: vi.fn(),
      getStockTargets: vi.fn().mockResolvedValue({
        exists: true,
        sizeIds: [91],
        modifierOptionIds: [],
      }),
      saveStockSetup: vi.fn(),
    };
    const service = new ProductsService(repository);

    await expect(
      service.configureStock(9, {
        baseIngredients: [],
        sizes: [
          {
            externalSizeId: 999,
            ingredients: [{ itemId: 1, quantity: 1 }],
          },
        ],
        modifiers: [],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
