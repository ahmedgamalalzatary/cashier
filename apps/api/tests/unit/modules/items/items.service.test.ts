import { describe, expect, it, vi } from "vitest";
import type { ItemsRepository } from "../../../../src/modules/items/items.repository.js";
import { ItemsService } from "../../../../src/modules/items/items.service.js";

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
