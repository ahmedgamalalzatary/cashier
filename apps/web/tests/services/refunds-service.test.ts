import { testId } from "@cashier/shared/test-support";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRefund, getRefund, listRefunds } from "../../src/services/refunds-service";
import { api } from "@cashier/web-core/lib/api";

vi.mock("@cashier/web-core/lib/api", () => ({ api: vi.fn() }));

describe("refunds service", () => {
  beforeEach(() => vi.mocked(api).mockReset());

  it("uses the refund endpoints", async () => {
    vi.mocked(api).mockResolvedValue([]);
    await listRefunds();
    await getRefund(testId(4));
    await createRefund({
      clientRequestId: "8f345091-c497-4b8b-b4f3-a8ebdc47dd31",
      orderId: testId(2),
      reason: "طلب العميل",
      lines: [{ orderLineId: testId(3), quantity: 1, stockAction: null }],
    });
    expect(vi.mocked(api).mock.calls).toEqual([
      ["/api/refunds"],
      ["/api/refunds/00000000-0000-7000-8000-000000000004"],
      [
        "/api/refunds",
        {
          method: "POST",
          body: JSON.stringify({
            clientRequestId: "8f345091-c497-4b8b-b4f3-a8ebdc47dd31",
            orderId: testId(2),
            reason: "طلب العميل",
            lines: [{ orderLineId: testId(3), quantity: 1, stockAction: null }],
          }),
        },
      ],
    ]);
  });
});
