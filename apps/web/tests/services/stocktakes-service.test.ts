import { describe, expect, it, vi } from "vitest";
import { api } from "../../src/lib/api";
import {
  confirmStocktake,
  createManualAdjustment,
  startStocktake,
  updateStocktakeCounts,
} from "../../src/services/stocktakes-service";

vi.mock("../../src/lib/api", () => ({ api: vi.fn() }));

describe("stocktakes service", () => {
  it("sends the stocktake lifecycle to its API endpoints", async () => {
    vi.mocked(api).mockResolvedValue({} as never);
    await startStocktake({ warehouse: "main", categoryId: null, note: null });
    await updateStocktakeCounts(4, [{ itemId: 2, countedQuantity: 3 }]);
    await confirmStocktake(4, "جرد شهري");
    await createManualAdjustment({
      warehouse: "cafe",
      itemId: 2,
      countedQuantity: 3,
      note: "تصحيح عد",
    });
    expect(api).toHaveBeenNthCalledWith(
      1,
      "/api/stocktakes",
      expect.objectContaining({ method: "POST" }),
    );
    expect(api).toHaveBeenNthCalledWith(
      2,
      "/api/stocktakes/4/counts",
      expect.objectContaining({ method: "PUT" }),
    );
    expect(api).toHaveBeenNthCalledWith(
      3,
      "/api/stocktakes/4/confirm",
      expect.objectContaining({ method: "POST" }),
    );
    expect(api).toHaveBeenNthCalledWith(
      4,
      "/api/stocktakes/manual-adjustments",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
