import { testId } from "@cashier/shared/test-support";
import { describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@cashier/shared";
import { requestFingerprint as hashRequest } from "../../src/lib/request-fingerprint.js";
import type { OrdersRepository } from "../../src/modules/orders/orders.repository.js";
import { OrdersService } from "../../src/modules/orders/orders.service.js";

const cashierActor: AuthUser = {
  id: testId(7),
  name: "Cashier",
  role: "cashier",
  branchId: testId(1),
  isSuperAdmin: false,
};

const adminActor: AuthUser = {
  id: testId(9),
  name: "Admin",
  role: "admin",
  branchId: null,
  isSuperAdmin: true,
};

const product = (externalId: number) => ({
  externalId,
  nameAr: `P${externalId}`,
  price: "10.00",
  discountPercentage: null,
  discountStart: null,
  discountEnd: null,
  isAvailable: true,
  isVisible: true,
  isCurrent: true,
  ingredients: [{ itemId: testId(1), itemName: "حليب", quantity: "0.010" }],
  sizes: [],
  modifierGroups: [
    {
      externalId: 1,
      nameAr: "إضافات",
      nameEn: "Extras",
      isRequired: false,
      maxSelections: 5,
      options: [
        {
          externalId: 1,
          nameAr: "بدون",
          nameEn: "None",
          extraPrice: "0.00",
          stockEffect: "none" as const,
          ingredients: [],
        },
        {
          externalId: 2,
          nameAr: "إضافي",
          nameEn: "Extra",
          extraPrice: "0.00",
          stockEffect: "none" as const,
          ingredients: [],
        },
      ],
    },
  ],
});

const line = (
  externalProductId: number,
  modifiers: Array<{ externalModifierOptionId: number; quantity: number }> = [],
) => ({
  type: "external_product" as const,
  externalProductId,
  externalSizeId: null,
  quantity: 1,
  modifiers,
});

describe("OrdersService idempotency fingerprint", () => {
  it("replays when cart lines are in a different order", async () => {
    let stored:
      | { id: string; cashierId: string; requestFingerprint: string }
      | undefined;
    const tx = {
      findByClientRequestId: vi.fn(async () => stored),
      findOpenShiftForCashier: vi.fn().mockResolvedValue({ id: testId(1) }),
      loadExternalProducts: vi.fn().mockResolvedValue([product(1), product(2)]),
      lockStockItems: vi.fn().mockResolvedValue([{ id: testId(1), isActive: true }]),
      createOrder: vi.fn(
        async (row: { requestFingerprint: string; cashierId: string }) => {
          stored = {
            id: testId(5),
            cashierId: row.cashierId,
            requestFingerprint: row.requestFingerprint,
          };
          return 5;
        },
      ),
      createLine: vi.fn().mockResolvedValue(testId(10)),
      createAllocation: vi.fn(),
      createLineModifier: vi.fn(),
      updateLine: vi.fn(),
      updateOrder: vi.fn(),
    };
    const repo = {
      transaction: vi.fn(async (run: (r: typeof tx, inv: object) => Promise<number>) =>
        run(tx, {
          consume: vi.fn().mockResolvedValue({
            allocations: [
              {
                quantity: "0.010",
                unitCost: "1.000000",
                batchId: testId(1),
              },
            ],
          }),
        }),
      ),
      findByClientRequestId: vi.fn(async () => stored),
      findOrder: vi.fn().mockResolvedValue({ id: testId(5) }),
      listLines: vi.fn().mockResolvedValue([]),
      listAllocations: vi.fn().mockResolvedValue([]),
      listModifiers: vi.fn().mockResolvedValue([]),
    } as unknown as OrdersRepository;
    const service = new OrdersService(repo);
    const clientRequestId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

    await service.create(
      {
        clientRequestId,
        lines: [line(2), line(1)],
        discount: null,
        cashReceived: 20,
      },
      cashierActor,
    );
    const replay = await service.create(
      {
        clientRequestId,
        lines: [line(1), line(2)],
        discount: null,
        cashReceived: 20,
      },
      cashierActor,
    );

    expect(replay.id).toBe(testId(5));
    expect(tx.createOrder).toHaveBeenCalledTimes(1);
  });

  it("replays when same product lines differ only by modifier order", async () => {
    let stored:
      | { id: string; cashierId: string; requestFingerprint: string }
      | undefined;
    const tx = {
      findByClientRequestId: vi.fn(async () => stored),
      findOpenShiftForCashier: vi.fn().mockResolvedValue({ id: testId(1) }),
      loadExternalProducts: vi.fn().mockResolvedValue([product(1)]),
      lockStockItems: vi.fn().mockResolvedValue([{ id: testId(1), isActive: true }]),
      createOrder: vi.fn(
        async (row: { requestFingerprint: string; cashierId: string }) => {
          stored = {
            id: testId(5),
            cashierId: row.cashierId,
            requestFingerprint: row.requestFingerprint,
          };
          return 5;
        },
      ),
      createLine: vi.fn().mockResolvedValue(testId(10)),
      createAllocation: vi.fn(),
      createLineModifier: vi.fn(),
      updateLine: vi.fn(),
      updateOrder: vi.fn(),
    };
    const repo = {
      transaction: vi.fn(
        async (run: (r: typeof tx, inv: object) => Promise<number>) =>
          run(tx, {
            consume: vi.fn().mockResolvedValue({
              allocations: [
                {
                  quantity: "0.010",
                  unitCost: "1.000000",
                  batchId: testId(1),
                },
              ],
            }),
          }),
      ),
      findByClientRequestId: vi.fn(async () => stored),
      findOrder: vi.fn().mockResolvedValue({ id: testId(5) }),
      listLines: vi.fn().mockResolvedValue([]),
      listAllocations: vi.fn().mockResolvedValue([]),
      listModifiers: vi.fn().mockResolvedValue([]),
    } as unknown as OrdersRepository;
    const service = new OrdersService(repo);
    const clientRequestId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const extra = [{ externalModifierOptionId: 2, quantity: 1 }];
    const plain = [{ externalModifierOptionId: 1, quantity: 1 }];

    await service.create(
      {
        clientRequestId,
        lines: [line(1, extra), line(1, plain)],
        discount: null,
        cashReceived: 20,
      },
      cashierActor,
    );
    const replay = await service.create(
      {
        clientRequestId,
        lines: [line(1, plain), line(1, extra)],
        discount: null,
        cashReceived: 20,
      },
      cashierActor,
    );

    expect(replay.id).toBe(testId(5));
    expect(tx.createOrder).toHaveBeenCalledTimes(1);
  });
});

function txForCreate(overrides: Record<string, unknown> = {}) {
  return {
    findByClientRequestId: vi.fn(async () => undefined),
    findOpenShiftForCashier: vi.fn(async () => ({ id: testId(1) })),
    loadExternalProducts: vi.fn(async () => [product(1)]),
    lockStockItems: vi.fn(async () => [{ id: testId(1), isActive: true }]),
    createOrder: vi.fn(async () => testId(5)),
    createLine: vi.fn(async () => testId(10)),
    createAllocation: vi.fn(async () => undefined),
    createLineModifier: vi.fn(async () => undefined),
    updateLine: vi.fn(async () => undefined),
    updateOrder: vi.fn(async () => undefined),
    ...overrides,
  };
}

function repoForCreate(tx: Record<string, unknown>) {
  const consume = vi.fn(async () => ({
    allocations: [
      { quantity: "0.010", unitCost: "1.000000", batchId: testId(1), movementId: testId(3) },
    ],
  }));
  return {
    transaction: vi.fn(async (run) => run(tx, { consume })),
    findByClientRequestId: vi.fn(async () => undefined),
    findOrder: vi.fn(async () => ({ id: testId(5) })),
    listLines: vi.fn(async () => []),
    listAllocations: vi.fn(async () => []),
    listModifiers: vi.fn(async () => []),
    consume,
  } as unknown as OrdersRepository;
}

const orderInput = {
  clientRequestId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  lines: [{ ...line(1) }],
  discount: null,
  cashReceived: 20,
};

describe("OrdersService line normalization", () => {
  it("merges duplicate identical lines into one", async () => {
    const tx = txForCreate({
      loadExternalProducts: vi.fn(async () => [product(1)]),
    });
    const repo = repoForCreate(tx);

    await new OrdersService(repo).create(
      { ...orderInput, lines: [line(1), line(1)] },
      cashierActor,
    );

    expect(tx.createLine).toHaveBeenCalledTimes(1);
    expect(tx.createLine).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: "2.000" }),
    );
  });

  it("keeps lines with different modifiers separate", async () => {
    const tx = txForCreate();
    const repo = repoForCreate(tx);
    const extra = [{ externalModifierOptionId: 2, quantity: 1 }];
    const plain = [{ externalModifierOptionId: 1, quantity: 1 }];

    await new OrdersService(repo).create(
      { ...orderInput, lines: [line(1, extra), line(1, plain)] },
      cashierActor,
    );

    expect(tx.createLine).toHaveBeenCalledTimes(2);
  });
});

describe("OrdersService replay rules", () => {
  it("409s when the same key is replayed with a different discount", async () => {
    const tx = txForCreate({
      findByClientRequestId: vi.fn(async () => ({
        id: testId(5),
        cashierId: testId(7),
        requestFingerprint: "different",
      })),
    });

    await expect(
      new OrdersService(repoForCreate(tx)).create(orderInput, cashierActor),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("409s when the same key is replayed by another cashier", async () => {
    const fingerprint = hashRequest({
      lines: [{ ...line(1), modifiers: [] }],
      discount: null,
      cashReceived: 20,
    });
    const tx = txForCreate({
      findByClientRequestId: vi.fn(async () => ({
        id: testId(5),
        cashierId: testId(555),
        requestFingerprint: fingerprint,
      })),
    });

    await expect(
      new OrdersService(repoForCreate(tx)).create(orderInput, cashierActor),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("maps a losing insert race to the replayed order", async () => {
    const duplicate = Object.assign(new Error("duplicate"), {
      code: "ER_DUP_ENTRY",
    });
    const fingerprint = hashRequest({
      lines: [{ ...line(1), modifiers: [] }],
      discount: null,
      cashReceived: 20,
    });
    const stored = { id: testId(5), cashierId: testId(7), requestFingerprint: fingerprint };
    const tx = txForCreate({
      findOpenShiftForCashier: vi.fn(async () => ({ id: testId(1) })),
      loadExternalProducts: vi.fn(async () => [product(1)]),
      lockStockItems: vi.fn(async () => [{ id: testId(1), isActive: true }]),
      createOrder: vi.fn(async () => {
        throw duplicate;
      }),
    });
    const repo = repoForCreate(tx);
    (repo.findByClientRequestId as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      stored,
    );

    const order = await new OrdersService(repo).create(orderInput, cashierActor);

    expect(order).toMatchObject({ id: testId(5) });
  });
});

describe("OrdersService create guards", () => {
  it("409s without an open shift and 404s an unknown product", async () => {
    const noShift = repoForCreate(
      txForCreate({
        findOpenShiftForCashier: vi.fn(async () => undefined),
      }),
    );
    await expect(
      new OrdersService(noShift).create(orderInput, cashierActor),
    ).rejects.toMatchObject({ status: 409 });

    const noProduct = repoForCreate(
      txForCreate({ loadExternalProducts: vi.fn(async () => []) }),
    );
    await expect(
      new OrdersService(noProduct).create(orderInput, cashierActor),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("409s missing or inactive stock items", async () => {
    const missing = repoForCreate(
      txForCreate({ lockStockItems: vi.fn(async () => []) }),
    );
    await expect(
      new OrdersService(missing).create(orderInput, cashierActor),
    ).rejects.toMatchObject({ status: 409 });

    const inactive = repoForCreate(
      txForCreate({
        lockStockItems: vi.fn(async () => [{ id: testId(1), isActive: false }]),
      }),
    );
    await expect(
      new OrdersService(inactive).create(orderInput, cashierActor),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("400s oversized quantities, excessive discounts, and short cash", async () => {
    const tooMany = repoForCreate(txForCreate());
    await expect(
      new OrdersService(tooMany).create(
        { ...orderInput, lines: [{ ...line(1), quantity: 1000 }] },
        cashierActor,
      ),
    ).rejects.toMatchObject({ status: 400 });

    const overDiscount = repoForCreate(txForCreate());
    await expect(
      new OrdersService(overDiscount).create(
        {
          ...orderInput,
          discount: { type: "fixed", value: 999 },
          cashReceived: 999,
        },
        cashierActor,
      ),
    ).rejects.toMatchObject({ status: 400 });

    const shortCash = repoForCreate(txForCreate());
    await expect(
      new OrdersService(shortCash).create(
        { ...orderInput, cashReceived: 1 },
        cashierActor,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("400s a consumption below stock precision", async () => {
    const dusty = {
      ...product(1),
      ingredients: [{ itemId: testId(1), itemName: "حليب", quantity: "0.0004" }],
    };
    const tx = txForCreate({
      loadExternalProducts: vi.fn(async () => [dusty]),
    });

    await expect(
      new OrdersService(repoForCreate(tx)).create(orderInput, cashierActor),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe("OrdersService admin sales", () => {
  it("skips the shift lookup and flags the sale for an admin", async () => {
    const tx = txForCreate();
    const repo = repoForCreate(tx);

    await new OrdersService(repo).create(orderInput, adminActor);

    expect(tx.findOpenShiftForCashier).not.toHaveBeenCalled();
    expect(tx.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        cashierId: testId(9),
        shiftId: null,
        isAdminSale: true,
      }),
    );
  });

  it("keeps the shift and clears the admin flag for a cashier", async () => {
    const tx = txForCreate();
    const repo = repoForCreate(tx);

    await new OrdersService(repo).create(orderInput, cashierActor);

    expect(tx.findOpenShiftForCashier).toHaveBeenCalledWith(testId(7));
    expect(tx.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        cashierId: testId(7),
        shiftId: testId(1),
        isAdminSale: false,
      }),
    );
  });
});

describe("OrdersService lookups", () => {
  it("404s a missing order and delegates the list", async () => {
    const repo = {
      findOrder: vi.fn(async () => undefined),
      listRecent: vi.fn(async () => [{ id: testId(1) }]),
    } as unknown as OrdersRepository;
    const service = new OrdersService(repo);

    await expect(service.get(testId(999))).rejects.toMatchObject({ status: 404 });
    await expect(service.list()).resolves.toEqual([{ id: testId(1) }]);
  });
});
