import { testId } from "@cashier/shared/test-support";
import { describe, expect, it, vi } from "vitest";
import { api } from "@cashier/web-core/lib/api";
import {
  confirmStocktake,
  createManualAdjustment,
  startStocktake,
  updateStocktakeCounts,
} from "../../src/services/stocktakes-service";

vi.mock("@cashier/web-core/lib/api", () => ({ api: vi.fn() }));

describe("stocktakes service", () => {
  it("sends the stocktake lifecycle to its API endpoints", async () => {
    vi.mocked(api).mockResolvedValue({} as never);
    await startStocktake({ warehouse: "main", categoryId: null, note: null });
    await updateStocktakeCounts(testId(4), [{ itemId: testId(2), countedQuantity: 3 }]);
    await confirmStocktake(testId(4), "جرد شهري");
    await createManualAdjustment({
      warehouse: "cafe",
      itemId: testId(2),
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
      "/api/stocktakes/00000000-0000-7000-8000-000000000004/counts",
      expect.objectContaining({ method: "PUT" }),
    );
    expect(api).toHaveBeenNthCalledWith(
      3,
      "/api/stocktakes/00000000-0000-7000-8000-000000000004/confirm",
      expect.objectContaining({ method: "POST" }),
    );
    expect(api).toHaveBeenNthCalledWith(
      4,
      "/api/stocktakes/manual-adjustments",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
