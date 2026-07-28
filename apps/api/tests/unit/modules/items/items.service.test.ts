import { describe, expect, it, vi } from "vitest";
import type { ItemsRepository } from "../../../../src/modules/items/items.repository.js";
import { ItemsService } from "../../../../src/modules/items/items.service.js";

const input = {
  name: "تي شيرت",
  categoryId: 3,
  variants: [
    { colorId: 4, sizeId: 5, barcode: "6221", sellingPrice: 250 },
    { colorId: 4, sizeId: 6, barcode: null, sellingPrice: 260 },
  ],
} as const;

describe("ItemsService product variants", () => {
  it("creates a product and assigns one generated code to every variant", async () => {
    const transactionRepo = {
      lockCategories: vi
        .fn()
        .mockResolvedValue([{ id: 3, parentId: 1, isActive: true }]),
      categoryHasChildren: vi.fn().mockResolvedValue(false),
      lockOptions: vi.fn().mockResolvedValue([
        [{ id: 4, isActive: true }],
        [
          { id: 5, isActive: true },
          { id: 6, isActive: true },
        ],
      ]),
      createProduct: vi.fn().mockResolvedValue(9),
      nextItemCodes: vi.fn().mockResolvedValue([101, 102]),
      createVariants: vi.fn().mockResolvedValue(undefined),
    };
    const repo = {
      transaction: vi.fn(async (run) => run(transactionRepo)),
    } as unknown as ItemsRepository;

    const id = await new ItemsService(repo).create(input as never);

    expect(id).toBe(9);
    expect(transactionRepo.nextItemCodes).toHaveBeenCalledWith(2);
    expect(transactionRepo.createVariants).toHaveBeenCalledWith(
      9,
      input.variants,
      [101, 102],
    );
  });

  it("deactivates the product and all of its variants atomically", async () => {
    const transactionRepo = {
      findProductForUpdate: vi
        .fn()
        .mockResolvedValue({ id: 7, isActive: true }),
      deactivateProduct: vi.fn().mockResolvedValue(undefined),
    };
    const repo = {
      transaction: vi.fn(async (run) => run(transactionRepo)),
    } as unknown as ItemsRepository;

    await new ItemsService(repo).deactivate(7);

    expect(transactionRepo.deactivateProduct).toHaveBeenCalledWith(7);
  });

  it("updates existing variants and creates new variants in one transaction", async () => {
    const existing = {
      id: 20,
      colorId: 4,
      sizeId: 5,
      barcode: "NEW-BARCODE",
      sellingPrice: 275,
      isActive: false,
    };
    const added = {
      colorId: 4,
      sizeId: 6,
      barcode: null,
      sellingPrice: 280,
      isActive: true,
    };
    const transactionRepo = {
      findProductForUpdate: vi
        .fn()
        .mockResolvedValue({ id: 7, categoryId: 3, isActive: true }),
      lockVariantsForProduct: vi.fn().mockResolvedValue([{ id: 20 }]),
      lockCategories: vi
        .fn()
        .mockResolvedValue([{ id: 3, parentId: 1, isActive: true }]),
      categoryHasChildren: vi.fn().mockResolvedValue(false),
      lockOptions: vi
        .fn()
        .mockResolvedValue([
          [{ id: 4, isActive: true }],
          [{ id: 6, isActive: true }],
        ]),
      updateProduct: vi.fn().mockResolvedValue(true),
      updateVariants: vi.fn().mockResolvedValue(undefined),
      nextItemCodes: vi.fn().mockResolvedValue([103]),
      createVariants: vi.fn().mockResolvedValue(undefined),
    };
    const repo = {
      transaction: vi.fn(async (run) => run(transactionRepo)),
    } as unknown as ItemsRepository;

    await new ItemsService(repo).update(7, {
      name: "تي شيرت محدث",
      variants: [existing, added],
    });

    expect(transactionRepo.updateVariants).toHaveBeenCalledWith(7, [existing]);
    expect(transactionRepo.createVariants).toHaveBeenCalledWith(
      7,
      [added],
      [103],
    );
    expect(transactionRepo.lockOptions).toHaveBeenCalledWith(3, [4], [6]);
  });

  it("rejects variant ids that do not belong to the product", async () => {
    const transactionRepo = {
      findProductForUpdate: vi
        .fn()
        .mockResolvedValue({ id: 7, categoryId: 3, isActive: true }),
      lockVariantsForProduct: vi.fn().mockResolvedValue([]),
    };
    const repo = {
      transaction: vi.fn(async (run) => run(transactionRepo)),
    } as unknown as ItemsRepository;

    await expect(
      new ItemsService(repo).update(7, {
        variants: [
          {
            id: 99,
            colorId: 4,
            sizeId: 5,
            sellingPrice: 250,
            isActive: true,
          },
        ],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("returns an actionable conflict for duplicate variant data", async () => {
    const repo = {
      transaction: vi.fn().mockRejectedValue({ code: "ER_DUP_ENTRY" }),
    } as unknown as ItemsRepository;

    await expect(
      new ItemsService(repo).create(input as never),
    ).rejects.toMatchObject({ status: 409 });
  });
});
