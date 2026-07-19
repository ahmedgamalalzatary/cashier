import { describe, expect, it } from "vitest";
import { sumDecimalValues } from "../../src/lib/format";

describe("sumDecimalValues", () => {
  it("adds decimal stock values without floating-point accumulation", () => {
    expect(
      sumDecimalValues(["0.100000000", "0.200000000", "-0.050000000"]),
    ).toBe("0.250000000");
  });
});
