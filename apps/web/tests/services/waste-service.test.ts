import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../src/lib/api";
import {
  createWaste,
  getWaste,
  getWasteCatalog,
  listWaste,
} from "../../src/services/waste-service";

vi.mock("../../src/lib/api", () => ({ api: vi.fn() }));

describe("waste service", () => {
  beforeEach(() => vi.mocked(api).mockReset());

  it("uses the waste endpoints", async () => {
    vi.mocked(api).mockResolvedValue([]);
    const body = {
      clientRequestId: "8f345091-c497-4b8b-b4f3-a8ebdc47dd31",
      warehouse: "cafe" as const,
      target: { type: "item" as const, itemId: 2 },
      quantity: 1,
      reason: "damaged" as const,
      note: null,
    };
    await getWasteCatalog();
    await listWaste();
    await getWaste(4);
    await createWaste(body);
    expect(vi.mocked(api).mock.calls).toEqual([
      ["/api/waste/catalog"],
      ["/api/waste"],
      ["/api/waste/4"],
      ["/api/waste", { method: "POST", body: JSON.stringify(body) }],
    ]);
  });
});
