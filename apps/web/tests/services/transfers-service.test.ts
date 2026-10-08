import { testId } from "@cashier/shared/test-support";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.fn();
vi.mock("@cashier/web-core/lib/api", () => ({ api }));

describe("transfers service", () => {
  beforeEach(() => api.mockReset());

  it("uses the shared request and transfer endpoints", async () => {
    const service = await import("../../src/services/transfers-service");

    service.listTransferRequests();
    service.getTransferRequest(testId(4));
    service.createTransferRequest({ clientRequestId: "11111111-1111-4111-8111-111111111111", notes: null, lines: [{ itemId: testId(2), quantity: 3 }] });
    service.approveTransferRequest(testId(4), [{ itemId: testId(2), quantity: 2.5 }]);
    service.rejectTransferRequest(testId(4), "غير مطلوب");
    service.listTransfers();
    service.getTransfer(testId(9));
    service.createDirectTransfer({ notes: "مباشر", lines: [{ itemId: testId(2), quantity: 1 }] });

    expect(api.mock.calls).toEqual([
      ["/api/transfers/requests"],
      ["/api/transfers/requests/00000000-0000-7000-8000-000000000004"],
      ["/api/transfers/requests", expect.objectContaining({ method: "POST" })],
      ["/api/transfers/requests/00000000-0000-7000-8000-000000000004/approve", expect.objectContaining({ method: "POST" })],
      ["/api/transfers/requests/00000000-0000-7000-8000-000000000004/reject", expect.objectContaining({ method: "POST" })],
      ["/api/transfers"],
      ["/api/transfers/00000000-0000-7000-8000-000000000009"],
      ["/api/transfers/direct", expect.objectContaining({ method: "POST" })],
    ]);
  });
});
