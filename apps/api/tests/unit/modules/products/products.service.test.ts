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
  it("coalesces concurrent refresh-on-use requests into one sync", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const external = {
      load: vi.fn(async () => {
        await pending;
        return catalog;
      }),
    };
    const cached = {
      categories: catalog.categories,
      products: [],
      lastSuccessfulSyncAt: new Date("2026-08-18T10:00:00Z"),
    };
    const repository = {
      applyCatalog: vi.fn().mockResolvedValue(undefined),
      recordSyncFailure: vi.fn().mockResolvedValue(undefined),
      getCatalog: vi.fn().mockResolvedValue(cached),
    };
    const service = new ProductsService(repository, external);

    const first = service.list();
    const second = service.list();
    release();
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(external.load).toHaveBeenCalledTimes(1);
    expect(repository.applyCatalog).toHaveBeenCalledTimes(1);
    expect(firstResult).toEqual(secondResult);
    expect(firstResult).toMatchObject({ stale: false, syncError: null });
  });

  it("deduplicates immediate refresh-on-use calls while manual refresh bypasses the window", async () => {
    const external = { load: vi.fn().mockResolvedValue(catalog) };
    const cached = {
      categories: catalog.categories,
      products: [],
      lastSuccessfulSyncAt: new Date("2026-08-18T10:00:00Z"),
    };
    const repository = {
      applyCatalog: vi.fn().mockResolvedValue(undefined),
      recordSyncFailure: vi.fn(),
      getCatalog: vi.fn().mockResolvedValue(cached),
    };
    const service = new ProductsService(repository, external);

    await service.list();
    await service.list();
    await service.refresh();

    expect(external.load).toHaveBeenCalledTimes(2);
  });

  it("serves the last valid cache as stale when refresh fails", async () => {
    const external = {
      load: vi.fn().mockRejectedValue(new Error("upstream unavailable")),
    };
    const cached = {
      categories: catalog.categories,
      products: [{ externalId: 9 }],
      lastSuccessfulSyncAt: new Date("2026-08-18T10:00:00Z"),
    };
    const repository = {
      applyCatalog: vi.fn(),
      recordSyncFailure: vi.fn().mockResolvedValue(undefined),
      getCatalog: vi.fn().mockResolvedValue(cached),
    };

    const result = await new ProductsService(repository, external).list();

    expect(repository.applyCatalog).not.toHaveBeenCalled();
    expect(repository.recordSyncFailure).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      products: [{ externalId: 9 }],
      stale: true,
      syncError: "تعذر تحديث المنتجات الخارجية",
    });
  });

  it("blocks catalog use when the first refresh fails and no cache exists", async () => {
    const repository = {
      applyCatalog: vi.fn(),
      recordSyncFailure: vi.fn().mockResolvedValue(undefined),
      getCatalog: vi.fn().mockResolvedValue(null),
    };
    const external = {
      load: vi.fn().mockRejectedValue(new Error("upstream unavailable")),
    };

    await expect(
      new ProductsService(repository, external).list(),
    ).rejects.toMatchObject({ status: 503 });
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
    const service = new ProductsService(repository, { load: vi.fn() });

    await expect(
      service.configureStock(9, {
        baseIngredients: [],
        sizes: [
          {
            externalSizeId: 91,
            ingredients: [{ itemId: 1, quantity: 1 }],
          },
        ],
        modifiers: [
          { externalModifierOptionId: 101, stockEffect: "none" },
        ],
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
    const service = new ProductsService(repository, { load: vi.fn() });

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
