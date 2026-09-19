import { describe, expect, it, vi } from "vitest";
import type { OrdersRepository } from "../../src/modules/orders/orders.repository.js";
import { OrdersService } from "../../src/modules/orders/orders.service.js";

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
  ingredients: [{ itemId: 1, itemName: "حليب", quantity: "0.010" }],
  sizes: [],
  modifierGroups: [],
});

const line = (externalProductId: number) => ({
  type: "external_product" as const,
  externalProductId,
  externalSizeId: null,
  quantity: 1,
  modifiers: [],
});

describe("OrdersService idempotency fingerprint", () => {
  it("replays when cart lines are in a different order", async () => {
    let stored:
      | { id: number; cashierId: number; requestFingerprint: string }
      | undefined;
    const tx = {
      findByClientRequestId: vi.fn(async () => stored),
      findOpenShiftForCashier: vi.fn().mockResolvedValue({ id: 1 }),
      loadExternalProducts: vi.fn().mockResolvedValue([product(1), product(2)]),
      lockStockItems: vi.fn().mockResolvedValue([{ id: 1, isActive: true }]),
      createOrder: vi.fn(
        async (row: { requestFingerprint: string; cashierId: number }) => {
          stored = {
            id: 5,
            cashierId: row.cashierId,
            requestFingerprint: row.requestFingerprint,
          };
          return 5;
        },
      ),
      createLine: vi.fn().mockResolvedValue(10),
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
                batchId: 1,
              },
            ],
          }),
        }),
      ),
      findByClientRequestId: vi.fn(async () => stored),
      findOrder: vi.fn().mockResolvedValue({ id: 5 }),
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
      7,
    );
    const replay = await service.create(
      {
        clientRequestId,
        lines: [line(1), line(2)],
        discount: null,
        cashReceived: 20,
      },
      7,
    );

    expect(replay.id).toBe(5);
    expect(tx.createOrder).toHaveBeenCalledTimes(1);
  });
});
