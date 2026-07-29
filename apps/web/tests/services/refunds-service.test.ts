import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRefund, getRefund, listRefunds } from "../../src/services/refunds-service";
import { api } from "../../src/lib/api";

vi.mock("../../src/lib/api", () => ({ api: vi.fn() }));

describe("refunds service", () => {
  beforeEach(() => vi.mocked(api).mockReset());

  it("uses the refund endpoints", async () => {
    vi.mocked(api).mockResolvedValue([]);
    await listRefunds();
    await getRefund(4);
    await createRefund({
      clientRequestId: "8f345091-c497-4b8b-b4f3-a8ebdc47dd31",
      orderId: 2,
      reason: "طلب العميل",
      lines: [{ orderLineId: 3, quantity: 1, stockAction: null }],
    });
    expect(vi.mocked(api).mock.calls).toEqual([
      ["/api/refunds"],
      ["/api/refunds/4"],
      [
        "/api/refunds",
        {
          method: "POST",
          body: JSON.stringify({
            clientRequestId: "8f345091-c497-4b8b-b4f3-a8ebdc47dd31",
            orderId: 2,
            reason: "طلب العميل",
            lines: [{ orderLineId: 3, quantity: 1, stockAction: null }],
          }),
        },
      ],
    ]);
  });
});
