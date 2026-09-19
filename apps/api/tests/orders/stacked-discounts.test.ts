import { describe, expect, it, vi } from "vitest";
import type { OrdersRepository } from "../../src/modules/orders/orders.repository.js";
import { OrdersService } from "../../src/modules/orders/orders.service.js";

// OrdersService.create evaluates catalog discount windows against the real
// clock, so the test window is intentionally endless to stay always active.
const product = (
  price: string,
  discountPercentage: string,
  extraPrice: string | null,
) => ({
  externalId: 1,
  nameAr: "P1",
  price,
  discountPercentage,
  discountStart: "2026-01-01T00:00:00",
  discountEnd: "2099-01-01T00:00:00",
  isAvailable: true,
  isVisible: true,
  isCurrent: true,
  ingredients: [{ itemId: 1, itemName: "حليب", quantity: "0.010" }],
  sizes: [],
  modifierGroups:
    extraPrice === null
      ? []
      : [
          {
            externalId: 1,
            nameAr: "إضافات",
            isRequired: false,
            maxSelections: 5,
            options: [
              {
                externalId: 2,
                nameAr: "إضافي",
                extraPrice,
                stockEffect: "none" as const,
                ingredients: [],
              },
            ],
          },
        ],
});

const lineInput = (
  quantity: number,
  modifiers: Array<{ externalModifierOptionId: number; quantity: number }> = [],
) => ({
  type: "external_product" as const,
  externalProductId: 1,
  externalSizeId: null,
  quantity,
  modifiers,
});

const makeService = (productRow: ReturnType<typeof product>) => {
  const tx = {
    findByClientRequestId: vi.fn(async () => undefined),
    findOpenShiftForCashier: vi.fn().mockResolvedValue({ id: 1 }),
    loadExternalProducts: vi.fn().mockResolvedValue([productRow]),
    lockStockItems: vi.fn().mockResolvedValue([{ id: 1, isActive: true }]),
    createOrder: vi.fn(async (_row: Record<string, unknown>) => 5),
    createLine: vi.fn(async (_row: Record<string, unknown>) => 10),
    createLineModifier: vi.fn().mockResolvedValue(undefined),
    createAllocation: vi.fn().mockResolvedValue(undefined),
    updateLine: vi.fn().mockResolvedValue(undefined),
    updateOrder: vi.fn().mockResolvedValue(undefined),
  };
  const repo = {
    transaction: vi.fn(async (
      run: (r: typeof tx, inventory: unknown) => Promise<number>,
    ) =>
      run(tx, {
        consume: vi.fn().mockResolvedValue({
          allocations: [
            { quantity: "0.010", unitCost: "1.000000", batchId: 1, movementId: 1 },
          ],
        }),
      }),
    ),
    findByClientRequestId: vi.fn(async () => undefined),
    findOrder: vi.fn().mockResolvedValue({ id: 5 }),
    listLines: vi.fn().mockResolvedValue([]),
    listAllocations: vi.fn().mockResolvedValue([]),
    listModifiers: vi.fn().mockResolvedValue([]),
  } as unknown as OrdersRepository;
  return { service: new OrdersService(repo), tx };
};

// Stacked math (audit E2): the catalog discount is baked into each line's
// unit price, then the POS discount is applied to the line subtotals.
describe("stacked catalog + POS discounts", () => {
  it("applies POS percent on top of a catalog-discounted line with a full-price modifier extra", async () => {
    // 10.00 with catalog 50% → base 5.00; the +3.00 extra escapes the catalog
    // discount, so unit = 8.00; ×2 → subtotal 16.00; POS 25% → 4.00 off.
    const { service, tx } = makeService(product("10.00", "50.00", "3.00"));

    await service.create(
      {
        clientRequestId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        lines: [lineInput(2, [{ externalModifierOptionId: 2, quantity: 1 }])],
        discount: { type: "percent", value: 25 },
        cashReceived: 20,
      },
      7,
    );

    expect(tx.createLine).toHaveBeenCalledWith(
      expect.objectContaining({ unitPrice: "8.00", lineSubtotal: "16.00" }),
    );
    expect(tx.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        subtotal: "16.00",
        discountType: "percent",
        discountValue: "25.00",
        discountAmount: "4.00",
        total: "12.00",
        cashReceived: "20.00",
        changeAmount: "8.00",
      }),
    );
  });

  it("rounds the POS percent half-up after the catalog discount", async () => {
    // 9.99 with catalog 5% → 9.49 (0.50 off); ×3 → subtotal 28.47;
    // POS 33.33% → 9.489051 → 9.49 (half-up), so total 18.98 and change 0.02.
    const { service, tx } = makeService(product("9.99", "5.00", null));

    await service.create(
      {
        clientRequestId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        lines: [lineInput(3)],
        discount: { type: "percent", value: 33.33 },
        cashReceived: 19,
      },
      7,
    );

    expect(tx.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        subtotal: "28.47",
        discountValue: "33.33",
        discountAmount: "9.49",
        total: "18.98",
        cashReceived: "19.00",
        changeAmount: "0.02",
      }),
    );
  });

  it("applies a POS fixed discount on a catalog-discounted line", async () => {
    // 12.34 with catalog 10% → 11.11 (1.23 off); POS fixed 1.11 → total 10.00.
    const { service, tx } = makeService(product("12.34", "10.00", null));

    await service.create(
      {
        clientRequestId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        lines: [lineInput(1)],
        discount: { type: "fixed", value: 1.11 },
        cashReceived: 10,
      },
      7,
    );

    expect(tx.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        subtotal: "11.11",
        discountType: "fixed",
        discountValue: "1.11",
        discountAmount: "1.11",
        total: "10.00",
        cashReceived: "10.00",
        changeAmount: "0.00",
      }),
    );
  });
});
