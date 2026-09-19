import { describe, expect, it, vi } from "vitest";
import type { ItemsRepository } from "../../src/modules/items/items.repository.js";
import { ItemsService } from "../../src/modules/items/items.service.js";

const newItem = {
  name: "بن برازيلي",
  categoryId: 3,
  type: "raw",
  stockUnit: "كجم",
  mainMinimumLevel: 0,
  cafeMinimumLevel: 0,
} as const;

function repoWithCategory(overrides: Record<string, unknown>) {
  const transactionRepo = {
    lockCategories: vi
      .fn()
      .mockResolvedValue([{ id: 3, isActive: true, parentId: 1 }]),
    categoryHasChildren: vi.fn().mockResolvedValue(false),
    ...overrides,
  };
  const repo = {
    transaction: vi.fn(async (run) => run(transactionRepo)),
  } as unknown as ItemsRepository;
  return { repo, transactionRepo };
}

describe("ItemsService code assignment", () => {
  it("stamps the next sequential code, ignoring any client-supplied code", async () => {
    const { repo, transactionRepo } = repoWithCategory({
      nextItemCode: vi.fn().mockResolvedValue(43),
      create: vi.fn().mockResolvedValue(9),
    });

    await new ItemsService(repo).create({ ...newItem, code: 999 } as never);

    expect(transactionRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "بن برازيلي" }),
      43,
    );
  });

  it("reads the next code once, inside the same transaction as the insert", async () => {
    const { repo, transactionRepo } = repoWithCategory({
      nextItemCode: vi.fn().mockResolvedValue(43),
      create: vi.fn().mockResolvedValue(9),
    });

    const id = await new ItemsService(repo).create(newItem as never);

    // the code comes from a locking read, so a second attempt would only ever
    // re-read the same number; correctness has to come from the lock, not a retry
    expect(id).toBe(9);
    expect(transactionRepo.nextItemCode).toHaveBeenCalledOnce();
    expect(transactionRepo.create).toHaveBeenCalledOnce();
    expect(repo.transaction).toHaveBeenCalledOnce();
  });

  it("surfaces a duplicate-code insert instead of silently retrying it", async () => {
    const duplicate = Object.assign(new Error("duplicate"), {
      code: "ER_DUP_ENTRY",
    });
    const { repo, transactionRepo } = repoWithCategory({
      nextItemCode: vi.fn().mockResolvedValue(43),
      create: vi.fn().mockRejectedValue(duplicate),
    });

    await expect(
      new ItemsService(repo).create(newItem as never),
    ).rejects.toThrow("duplicate");
    expect(transactionRepo.create).toHaveBeenCalledOnce();
  });
});

describe("ItemsService deactivation", () => {
  it("locks and deactivates the item inside one transaction", async () => {
    const transactionRepo = {
      findByIdForUpdate: vi.fn().mockResolvedValue({ id: 7, isActive: true }),
      hasActiveRecipeReferences: vi.fn().mockResolvedValue(false),
      deactivate: vi.fn().mockResolvedValue(true),
    };
    const repo = {
      transaction: vi.fn(async (run) => run(transactionRepo)),
      findById: vi.fn(),
      deactivate: vi.fn(),
    } as unknown as ItemsRepository;

    await new ItemsService(repo).deactivate(7);

    expect(repo.transaction).toHaveBeenCalledOnce();
    expect(transactionRepo.findByIdForUpdate).toHaveBeenCalledWith(7);
    expect(transactionRepo.deactivate).toHaveBeenCalledWith(7);
    expect(repo.findById).not.toHaveBeenCalled();
    expect(repo.deactivate).not.toHaveBeenCalled();
  });
});

function txWithItem(
  item: Record<string, unknown> | undefined,
  overrides: Record<string, unknown> = {},
) {
  return {
    lockCategories: vi
      .fn()
      .mockResolvedValue([{ id: 3, isActive: true, parentId: 1 }]),
    categoryHasChildren: vi.fn().mockResolvedValue(false),
    findByIdForUpdate: vi.fn(async () => item),
    hasStockHistory: vi.fn(async () => false),
    hasActiveRecipeReferences: vi.fn(async () => false),
    update: vi.fn(async () => undefined),
    deactivate: vi.fn(async () => undefined),
    ...overrides,
  };
}

function serviceWithItem(
  item: Record<string, unknown> | undefined,
  overrides: Record<string, unknown> = {},
) {
  const tx = txWithItem(item, overrides);
  const repo = {
    transaction: vi.fn(async (run) => run(tx)),
  } as unknown as ItemsRepository;
  return { service: new ItemsService(repo), tx };
}

const storedRaw = () => ({
  id: 5,
  categoryId: 3,
  type: "raw",
  stockUnit: "كجم",
  purchaseUnit: "شكارة",
  purchaseToStockFactor: "25.000000",
  sellingPrice: null,
  isActive: true,
});

describe("ItemsService category validation", () => {
  it("400s a missing category and 409s inactive or child-bearing mains", async () => {
    const missing = repoWithCategory({
      lockCategories: vi.fn().mockResolvedValue([]),
      nextItemCode: vi.fn(),
      create: vi.fn(),
    });
    await expect(
      new ItemsService(missing.repo).create(newItem as never),
    ).rejects.toMatchObject({ status: 400 });

    const inactive = repoWithCategory({
      lockCategories: vi
        .fn()
        .mockResolvedValue([{ id: 3, isActive: false, parentId: 1 }]),
      nextItemCode: vi.fn(),
      create: vi.fn(),
    });
    await expect(
      new ItemsService(inactive.repo).create(newItem as never),
    ).rejects.toMatchObject({ status: 409 });

    const mainWithChildren = repoWithCategory({
      lockCategories: vi
        .fn()
        .mockResolvedValue([{ id: 3, isActive: true, parentId: null }]),
      categoryHasChildren: vi.fn().mockResolvedValue(true),
      nextItemCode: vi.fn(),
      create: vi.fn(),
    });
    await expect(
      new ItemsService(mainWithChildren.repo).create(newItem as never),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("ItemsService update guards", () => {
  it("404s a missing item", async () => {
    const { service } = serviceWithItem(undefined);
    await expect(
      service.update(999, { name: "x" } as never),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("requires a price when flipping to resale and forbids it elsewhere", async () => {
    const flip = serviceWithItem(storedRaw());
    await expect(
      flip.service.update(5, { type: "resale" } as never),
    ).rejects.toMatchObject({ status: 400 });

    const pricedElsewhere = serviceWithItem(storedRaw());
    await expect(
      pricedElsewhere.service.update(5, { sellingPrice: 9 } as never),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects a half-cleared purchase-unit pair", async () => {
    const { service } = serviceWithItem(storedRaw());
    await expect(
      service.update(5, { purchaseUnit: null } as never),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("freezes stock meaning after history or recipe links", async () => {
    for (const flag of ['hasStockHistory', 'hasActiveRecipeReferences'] as const) {
      const { service } = serviceWithItem(storedRaw(), {
        [flag]: vi.fn(async () => true),
      });
      await expect(
        service.update(5, { stockUnit: "جم" } as never),
      ).rejects.toMatchObject({ status: 409 });
    }
  });

  it("nulls the selling price when leaving resale", async () => {
    const resale = {
      ...storedRaw(),
      type: "resale",
      sellingPrice: "12.50",
    };
    const { service, tx } = serviceWithItem(resale);
    await service.update(5, { type: "raw" } as never);
    expect(tx.update).toHaveBeenCalledWith(5, { type: "raw", sellingPrice: null });
  });
});

describe("ItemsService deactivation guards", () => {
  it("404s a missing item and skips an inactive one", async () => {
    const { service } = serviceWithItem(undefined);
    await expect(service.deactivate(999)).rejects.toMatchObject({
      status: 404,
    });

    const quiet = serviceWithItem({ id: 7, isActive: false });
    await quiet.service.deactivate(7);
    expect(quiet.tx.deactivate).not.toHaveBeenCalled();
  });

  it("409s deactivation of a recipe-linked item", async () => {
    const { service } = serviceWithItem(
      { id: 7, isActive: true },
      { hasActiveRecipeReferences: vi.fn(async () => true) },
    );
    await expect(service.deactivate(7)).rejects.toMatchObject({ status: 409 });
  });
});
