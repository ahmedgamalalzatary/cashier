import { describe, expect, it } from "vitest";
import { reportTotal } from "../../src/models/reports-model";
describe("reports model", () => {
  it("totals decimal report values without concatenating strings", () => {
    expect(
      reportTotal([{ amount: "12.50" }, { amount: "7.50" }], "amount"),
    ).toBe(20);
  });
});
