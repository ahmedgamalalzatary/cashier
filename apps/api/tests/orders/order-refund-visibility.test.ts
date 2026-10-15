import { describe, expect, it, vi } from "vitest";
import type { OrdersRepository } from "../../src/modules/orders/orders.repository.js";
import {
  OrdersService,
  refundStatusFor,
} from "../../src/modules/orders/orders.service.js";

describe("refundStatusFor", () => {
  it("is none when nothing came back", () => {
    expect(
      refundStatusFor([
        { soldQuantity: "3.000", refundedQuantity: "0.000", refundedAmount: "0.00" },
        { soldQuantity: "2.000", refundedQuantity: "0.000", refundedAmount: "0.00" },
      ]),
    ).toBe("none");
  });

  it("is full when every sold quantity returned", () => {
    expect(
      refundStatusFor([
        { soldQuantity: "3.000", refundedQuantity: "3.000", refundedAmount: "9.00" },
        { soldQuantity: "2.000", refundedQuantity: "2.000", refundedAmount: "4.00" },
      ]),
    ).toBe("full");
  });

  it("is full when a returned quantity slightly out-runs the sale rounding", () => {
    expect(
      refundStatusFor([
        { soldQuantity: "2.000", refundedQuantity: "2.000", refundedAmount: "4.00" },
      ]),
    ).toBe("full");
  });

  it("is partial when part of the order came back", () => {
    expect(
      refundStatusFor([
        { soldQuantity: "3.000", refundedQuantity: "1.000", refundedAmount: "3.00" },
        { soldQuantity: "2.000", refundedQuantity: "0.000", refundedAmount: "0.00" },
      ]),
    ).toBe("partial");
  });
});

describe("OrdersService refill refund figures", () => {
  const rows = [
    { id: "o1" },
    { id: "o2" },
  ] as never[];

  it("attaches the status and amount to every order row", async () => {
    const repo = {
      listRecent: vi.fn().mockResolvedValue(rows),
      listRefundFigures: vi.fn().mockResolvedValue([
        { orderId: "o1", orderLineId: "l1", soldQuantity: "3.000", refundedQuantity: "3.000", refundedAmount: "10.00" },
      ]),
    } as unknown as OrdersRepository;
    const out = await new OrdersService(repo).list();
    expect(out[0]).toMatchObject({ refundedAmount: "10.00", refundStatus: "full" });
    expect(out[1]).toMatchObject({ refundedAmount: "0.00", refundStatus: "none" });
  });

  it("attaches per-line returned quantity and the refund list to a detail", async () => {
    const repo = {
      findOrder: vi.fn().mockResolvedValue({ id: "o1" }),
      listLines: vi.fn().mockResolvedValue([
        { id: "l1", quantity: "3.000" },
        { id: "l2", quantity: "2.000" },
      ]),
      listAllocations: vi.fn().mockResolvedValue([]),
      listModifiers: vi.fn().mockResolvedValue([]),
      listRefundFigures: vi.fn().mockResolvedValue([
        { orderId: "o1", orderLineId: "l1", soldQuantity: "3.000", refundedQuantity: "1.000", refundedAmount: "5.00" },
      ]),
      listOrderRefunds: vi.fn().mockResolvedValue([
        { id: "r9", amount: "5.00", createdAt: "2026-10-01T10:00:00Z" },
      ]),
    } as unknown as OrdersRepository;
    const out = await new OrdersService(repo).get("o1");
    expect(out.refunds).toEqual([
      { id: "r9", amount: "5.00", createdAt: "2026-10-01T10:00:00Z" },
    ]);
    expect(out.lines[0].refundedQuantity).toBe("1.000");
    expect(out.lines[1].refundedQuantity).toBe("0.000");
  });
});
