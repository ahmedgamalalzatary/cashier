import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@cashier/shared";
import type { WasteRepository } from "../../src/modules/waste/waste.repository.js";
import { WasteService } from "../../src/modules/waste/waste.service.js";

const actor = { id: 4, role: "admin" } as AuthUser;

describe("WasteService idempotency fingerprint", () => {
  it("replays the same waste entry when JSON field order differs", async () => {
    let stored:
      | { id: number; recordedBy: number; requestFingerprint: string }
      | undefined;
    const tx = {
      findByClientRequestId: vi.fn(async () => stored),
      findItem: vi.fn().mockResolvedValue({
        id: 2,
        name: "حليب",
        isActive: true,
      }),
      create: vi.fn(async (row: { requestFingerprint: string }) => {
        stored = {
          id: 8,
          recordedBy: actor.id,
          requestFingerprint: row.requestFingerprint,
        };
        return 8;
      }),
      createAllocation: vi.fn(),
      updateCost: vi.fn(),
    };
    const repo = {
      transaction: vi.fn(
        async (run: (r: typeof tx, inv: object) => Promise<number>) =>
          run(tx, {
            consume: vi.fn().mockResolvedValue({
              allocations: [
                {
                  quantity: "1.000",
                  unitCost: "2.000000",
                  batchId: 1,
                  movementId: 1,
                },
              ],
            }),
          }),
      ),
      findByClientRequestId: vi.fn(async () => stored),
      find: vi.fn().mockResolvedValue({ id: 8, warehouse: "main" }),
      allocations: vi.fn().mockResolvedValue([]),
    } as unknown as WasteRepository;
    const service = new WasteService(repo);
    const clientRequestId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

    await service.create(
      {
        clientRequestId,
        warehouse: "main",
        target: { type: "item", itemId: 2 },
        quantity: 1,
        reason: "spill",
        note: null,
      },
      actor,
    );
    const replay = await service.create(
      {
        note: null,
        reason: "spill",
        quantity: 1,
        target: { itemId: 2, type: "item" },
        warehouse: "main",
        clientRequestId,
      },
      actor,
    );

    expect(replay.id).toBe(8);
    expect(tx.create).toHaveBeenCalledTimes(1);
  });
});

describe("WasteService recipe target", () => {
  it("consumes scaled recipe ingredients and stores recipe ids", async () => {
    const consume = vi.fn().mockResolvedValue({
      allocations: [
        {
          quantity: "1.000",
          unitCost: "2.000000",
          batchId: 1,
          movementId: 11,
        },
      ],
    });
    let createdRow: Record<string, unknown> | undefined;
    const tx = {
      findByClientRequestId: vi.fn(async () => undefined),
      loadRecipeProduct: vi.fn().mockResolvedValue({
        recipeId: 3,
        recipeName: "كابتشينو",
        isActive: true,
        sizeId: 7,
        sizeName: "وسط",
        ingredients: [
          { itemId: 21, itemName: "حليب", quantity: "0.200" },
          { itemId: 22, itemName: "قهوة", quantity: "0.050" },
        ],
      }),
      create: vi.fn(async (row: Record<string, unknown>) => {
        createdRow = row;
        return 9;
      }),
      createAllocation: vi.fn(),
      updateCost: vi.fn(),
    };
    const repo = {
      transaction: vi.fn(
        async (run: (r: typeof tx, inv: object) => Promise<number>) =>
          run(tx, { consume }),
      ),
      findByClientRequestId: vi.fn(async () => undefined),
      find: vi.fn().mockResolvedValue({ id: 9, warehouse: "cafe" }),
      allocations: vi.fn().mockResolvedValue([]),
    } as unknown as WasteRepository;
    const service = new WasteService(repo);

    await service.create(
      {
        clientRequestId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        warehouse: "cafe",
        target: { type: "recipe", recipeId: 3, recipeSizeId: 7 },
        quantity: 2,
        reason: "spill",
        note: null,
      },
      actor,
    );

    expect(tx.loadRecipeProduct).toHaveBeenCalledWith(3, 7);
    expect(createdRow).toMatchObject({
      targetType: "recipe",
      recipeId: 3,
      recipeSizeId: 7,
      targetName: "كابتشينو",
      sizeName: "وسط",
    });
    expect(consume).toHaveBeenCalledTimes(2);
    expect(consume).toHaveBeenCalledWith(
      expect.objectContaining({
        itemId: 21,
        warehouse: "cafe",
        quantity: 0.4,
        movementType: "waste",
      }),
    );
    expect(consume).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: 22, quantity: 0.1 }),
    );
  });

  it("rejects recipe waste outside cafe with 400", async () => {
    const tx = {
      findByClientRequestId: vi.fn(async () => undefined),
      loadRecipeProduct: vi.fn(),
      create: vi.fn(),
      createAllocation: vi.fn(),
      updateCost: vi.fn(),
    };
    const repo = {
      transaction: vi.fn(
        async (run: (r: typeof tx, inv: object) => Promise<number>) =>
          run(tx, { consume: vi.fn() }),
      ),
    } as unknown as WasteRepository;
    const service = new WasteService(repo);

    await expect(
      service.create(
        {
          clientRequestId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          warehouse: "main",
          target: { type: "recipe", recipeId: 3, recipeSizeId: 7 },
          quantity: 1,
          reason: "spill",
          note: null,
        },
        actor,
      ),
    ).rejects.toThrowError("مخزن الكافيه");
  });

  it("converts only a recipe-size mismatch to 400 and rethrows other load failures", async () => {
    const mismatchTx = {
      findByClientRequestId: vi.fn(async () => undefined),
      loadRecipeProduct: vi
        .fn()
        .mockRejectedValue(new Error("RECIPE_SIZE_MISMATCH")),
      create: vi.fn(),
      createAllocation: vi.fn(),
      updateCost: vi.fn(),
    };
    const mismatchRepo = {
      transaction: vi.fn(
        async (run: (r: typeof mismatchTx, inv: object) => Promise<number>) =>
          run(mismatchTx, { consume: vi.fn() }),
      ),
    } as unknown as WasteRepository;

    await expect(
      new WasteService(mismatchRepo).create(
        {
          clientRequestId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01",
          warehouse: "cafe",
          target: { type: "recipe", recipeId: 3, recipeSizeId: 7 },
          quantity: 1,
          reason: "spill",
          note: null,
        },
        actor,
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: "المقاس لا ينتمي إلى الوصفة المحددة",
    });

    const dbFailure = new Error("DB boiled");
    const failingTx = {
      findByClientRequestId: vi.fn(async () => undefined),
      loadRecipeProduct: vi.fn().mockRejectedValue(dbFailure),
      create: vi.fn(),
      createAllocation: vi.fn(),
      updateCost: vi.fn(),
    };
    const failingRepo = {
      transaction: vi.fn(
        async (run: (r: typeof failingTx, inv: object) => Promise<number>) =>
          run(failingTx, { consume: vi.fn() }),
      ),
    } as unknown as WasteRepository;

    await expect(
      new WasteService(failingRepo).create(
        {
          clientRequestId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeee02",
          warehouse: "cafe",
          target: { type: "recipe", recipeId: 3, recipeSizeId: 7 },
          quantity: 1,
          reason: "spill",
          note: null,
        },
        actor,
      ),
    ).rejects.toBe(dbFailure);
  });
});

const cashier = { id: 9, role: "cashier" } as AuthUser;

const wasteInput = {
  clientRequestId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  warehouse: "cafe",
  target: { type: "item", itemId: 2 },
  quantity: 1,
  reason: "spill",
  note: null,
} as const;

function txForWaste(overrides: Record<string, unknown> = {}) {
  return {
    findByClientRequestId: vi.fn(async () => undefined),
    findOpenShiftForCashier: vi.fn(async () => ({ id: 3 })),
    findItem: vi.fn(async () => ({ id: 2, name: "حليب", isActive: true })),
    create: vi.fn(async () => 8),
    createAllocation: vi.fn(async () => undefined),
    updateCost: vi.fn(async () => undefined),
    ...overrides,
  };
}

function repoForWaste(tx: Record<string, unknown>) {
  return {
    transaction: vi.fn(async (run) =>
      run(tx, {
        consume: vi.fn(async () => ({
          allocations: [
            { quantity: "1.000", unitCost: "2.000000", batchId: 1, movementId: 1 },
          ],
        })),
      }),
    ),
    findByClientRequestId: vi.fn(async () => undefined),
    find: vi.fn(async () => ({ id: 8, warehouse: "cafe" })),
    allocations: vi.fn(async () => []),
    list: vi.fn(async () => []),
    listCatalogItems: vi.fn(async () => [{ id: 2 }]),
    listCatalogExternalProducts: vi.fn(async () => []),
    listCatalogRecipes: vi.fn(async () => []),
  } as unknown as WasteRepository;
}

describe("WasteService shift and replay guards", () => {
  it("403s a cashier outside cafe and 409s without an open shift", async () => {
    const mainWarehouse = repoForWaste(txForWaste());
    await expect(
      new WasteService(mainWarehouse).create(
        { ...wasteInput, warehouse: "main" },
        cashier,
      ),
    ).rejects.toMatchObject({ status: 403 });

    const noShift = repoForWaste(
      txForWaste({
        findOpenShiftForCashier: vi.fn(async () => undefined),
      }),
    );
    await expect(
      new WasteService(noShift).create({ ...wasteInput }, cashier),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("409s replays by another recorder or with different payload", async () => {
    const otherUser = repoForWaste(
      txForWaste({
        findByClientRequestId: vi.fn(async () => ({
          id: 8,
          recordedBy: 555,
          requestFingerprint: "whatever",
        })),
      }),
    );
    await expect(
      new WasteService(otherUser).create({ ...wasteInput }, cashier),
    ).rejects.toMatchObject({ status: 409 });

    const changedPayload = repoForWaste(
      txForWaste({
        findByClientRequestId: vi.fn(async () => ({
          id: 8,
          recordedBy: cashier.id,
          requestFingerprint: "different",
        })),
      }),
    );
    await expect(
      new WasteService(changedPayload).create({ ...wasteInput }, cashier),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("WasteService catalog, list, and get", () => {
  it("combines the three catalog sources", async () => {
    const repo = repoForWaste(txForWaste());

    await expect(new WasteService(repo).catalog()).resolves.toEqual({
      items: [{ id: 2 }],
      products: [],
      recipes: [],
    });
  });

  it("scopes the list to cafe for cashiers", async () => {
    const repo = repoForWaste(txForWaste());

    await new WasteService(repo).list(cashier);
    expect(repo.list).toHaveBeenCalledWith("cafe");

    await new WasteService(repo).list(actor);
    expect(repo.list).toHaveBeenCalledWith(undefined);
  });

  it("404s a missing entry and 403s a cashier outside cafe", async () => {
    const missing = repoForWaste(txForWaste());
    (missing.find as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined,
    );
    await expect(
      new WasteService(missing).get(999, cashier),
    ).rejects.toMatchObject({ status: 404 });

    const mainEntry = repoForWaste(txForWaste());
    (mainEntry.find as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 8,
      warehouse: "main",
    });
    await expect(
      new WasteService(mainEntry).get(8, cashier),
    ).rejects.toMatchObject({ status: 403 });
  });
});
