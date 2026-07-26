import { describe, expect, it, vi } from "vitest";
import type { ItemsRepository } from "../../../../src/modules/items/items.repository.js";
import { ItemsService } from "../../../../src/modules/items/items.service.js";

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
