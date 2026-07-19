import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.fn();
vi.mock("../../src/lib/api", () => ({ api }));

describe("transfers service", () => {
  beforeEach(() => api.mockReset());

  it("uses the shared request and transfer endpoints", async () => {
    const service = await import("../../src/services/transfers-service");

    service.listTransferRequests();
    service.getTransferRequest(4);
    service.createTransferRequest({ notes: null, lines: [{ itemId: 2, quantity: 3 }] });
    service.approveTransferRequest(4, [{ itemId: 2, quantity: 2.5 }]);
    service.rejectTransferRequest(4, "غير مطلوب");
    service.listTransfers();
    service.getTransfer(9);
    service.createDirectTransfer({ notes: "مباشر", lines: [{ itemId: 2, quantity: 1 }] });

    expect(api.mock.calls).toEqual([
      ["/api/transfers/requests"],
      ["/api/transfers/requests/4"],
      ["/api/transfers/requests", expect.objectContaining({ method: "POST" })],
      ["/api/transfers/requests/4/approve", expect.objectContaining({ method: "POST" })],
      ["/api/transfers/requests/4/reject", expect.objectContaining({ method: "POST" })],
      ["/api/transfers"],
      ["/api/transfers/9"],
      ["/api/transfers/direct", expect.objectContaining({ method: "POST" })],
    ]);
  });
});
