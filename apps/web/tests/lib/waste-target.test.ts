import { describe, expect, it } from "vitest";
import { warehouseForWasteTarget } from "../../src/lib/waste-target";

describe("warehouseForWasteTarget", () => {
  it("forces cafe and reports the switch when a product is chosen from main", () => {
    expect(warehouseForWasteTarget("product:12", "main")).toEqual({
      warehouse: "cafe",
      cafeForced: true,
    });
  });

  it("does not announce a switch when cafe is already selected", () => {
    expect(warehouseForWasteTarget("product:12", "cafe")).toEqual({
      warehouse: "cafe",
      cafeForced: false,
    });
  });

  it("leaves item waste on the chosen warehouse", () => {
    expect(warehouseForWasteTarget("item:4", "main")).toEqual({
      warehouse: "main",
      cafeForced: false,
    });
  });
});
