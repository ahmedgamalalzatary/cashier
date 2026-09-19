import { describe, expect, it } from "vitest";
import {
  adminCloseShiftInput,
  closeShiftInput,
  correctShiftInput,
  openShiftInput,
  shiftAuditNoteInput,
  shiftIdParam,
} from "../../src/modules/shifts/shifts.schemas.js";

describe("shift money schema", () => {
  it("accepts zero and the maximum", () => {
    expect(openShiftInput.parse({ openingFloat: 0 }).openingFloat).toBe(0);
    expect(
      closeShiftInput.parse({ actualCash: 9_999_999_999.99 }).actualCash,
    ).toBe(9_999_999_999.99);
  });

  it("rejects negative, over-max, over-precise, and non-finite amounts", () => {
    for (const actualCash of [-1, 10_000_000_000, 10.123, NaN, Infinity]) {
      expect(
        closeShiftInput.safeParse({ actualCash }).success,
        `amount ${String(actualCash)}`,
      ).toBe(false);
    }
  });
});

describe("shift correction schema", () => {
  const note = "تصحيح";

  it("rejects a note-only correction with no values", () => {
    const result = correctShiftInput.safeParse({ note });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "يجب إدخال قيمة واحدة على الأقل للتصحيح",
      );
    }
  });

  it("accepts a single-field correction", () => {
    expect(
      correctShiftInput.parse({ note, openingFloat: 100 }).openingFloat,
    ).toBe(100);
    expect(correctShiftInput.parse({ note, actualCash: 50 }).actualCash).toBe(
      50,
    );
  });

  it("rejects blank and over-long audit notes", () => {
    expect(shiftAuditNoteInput.safeParse({ note: "   " }).success).toBe(false);
    expect(
      shiftAuditNoteInput.safeParse({ note: "x".repeat(501) }).success,
    ).toBe(false);
    expect(
      adminCloseShiftInput.safeParse({ actualCash: 10, note: "   " }).success,
    ).toBe(false);
  });
});

describe("shift id param", () => {
  it("rejects zero, negative, and non-numeric ids but coerces strings", () => {
    for (const value of [0, -1, "abc"]) {
      expect(shiftIdParam.safeParse(value).success).toBe(false);
    }
    expect(shiftIdParam.parse("5")).toBe(5);
  });
});
