import { describe, expect, it } from "vitest";
import {
  adjustmentInput,
  advanceInput,
  monthParam,
} from "../../src/modules/salaries/salaries.schemas.js";

describe("salary input validation", () => {
  it("accepts real calendar months and positive two-decimal amounts", () => {
    expect(monthParam.parse("2026-09")).toBe("2026-09");
    expect(
      advanceInput.parse({
        employeeId: 1,
        amount: 100.25,
        entryDate: "2026-09-10",
        note: "سلفة",
      }),
    ).toMatchObject({ amount: 100.25 });
    expect(
      adjustmentInput.parse({
        employeeId: 1,
        type: "bonus",
        amount: 20,
        entryDate: "2026-09-10",
      }),
    ).toMatchObject({ type: "bonus" });
  });

  it("rejects invalid months, zero amounts, and excess precision", () => {
    expect(monthParam.safeParse("2026-13").success).toBe(false);
    expect(
      advanceInput.safeParse({
        employeeId: 1,
        amount: 0,
        entryDate: "2026-09-10",
      }).success,
    ).toBe(false);
    expect(
      adjustmentInput.safeParse({
        employeeId: 1,
        type: "deduction",
        amount: 1.001,
        entryDate: "2026-09-10",
      }).success,
    ).toBe(false);
  });
});
