import { describe, expect, it } from "vitest";
import {
  formatItemCode,
  formatMoney,
  formatOptionalMoney,
  itemLabel,
  sumDecimalValues,
} from "../../src/lib/format";

describe("formatOptionalMoney", () => {
  it("shows a dash when the cost is hidden", () => {
    expect(formatOptionalMoney(undefined)).toBe("—");
    expect(formatOptionalMoney(null)).toBe("—");
  });

  it("formats a present cost as money", () => {
    expect(formatOptionalMoney("60.00")).toBe(formatMoney("60.00"));
  });
});

describe("itemLabel", () => {
  it("puts the padded code before the item name", () => {
    expect(itemLabel(7, "بن برازيلي")).toBe("0007 · بن برازيلي");
  });
});

describe("formatItemCode", () => {
  it("pads item codes to four digits", () => {
    expect(formatItemCode(1)).toBe("0001");
    expect(formatItemCode(742)).toBe("0742");
  });

  it("keeps codes past four digits intact", () => {
    expect(formatItemCode(10000)).toBe("10000");
  });
});

describe("sumDecimalValues", () => {
  it("adds decimal stock values without floating-point accumulation", () => {
    expect(
      sumDecimalValues(["0.100000000", "0.200000000", "-0.050000000"]),
    ).toBe("0.250000000");
  });
});
