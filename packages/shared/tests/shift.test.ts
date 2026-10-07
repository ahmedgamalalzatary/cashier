import { describe, expect, it } from "vitest";
import { MAX_SHIFT_HOURS, SHIFT_WARNING_MINUTES } from "../src/types.js";
import { shiftAutoCloseWarning } from "../src/shift.js";

const open = (workedMinutes: number) => ({
  status: "open" as const,
  workedMinutes,
});

describe("shift auto-close warning", () => {
  it("stays quiet while the shift is young", () => {
    expect(shiftAutoCloseWarning(open(60))).toBeNull();
    expect(shiftAutoCloseWarning(open(8 * 60))).toBeNull();
  });

  it("warns an hour before the system closes the shift", () => {
    const warning = shiftAutoCloseWarning(open(15 * 60));
    expect(warning).not.toBeNull();
    expect(warning?.remainingMinutes).toBe(60);
    expect(warning?.text).toContain("ستُغلق");
  });

  it("keeps warning once the limit has passed", () => {
    const warning = shiftAutoCloseWarning(open(20 * 60));
    expect(warning?.remainingMinutes).toBe(0);
    expect(warning?.text).toBe(
      "بلغت ورديتك الحد الأقصى وستُغلق تلقائياً دون عدّ الدرج — أغلقها وعدّ الدرج الآن",
    );
  });

  it("bases a reopened shift warning on its current segment rather than total worked time", () => {
    expect(
      shiftAutoCloseWarning({ ...open(17 * 60), currentSegmentMinutes: 30 }),
    ).toBeNull();
    expect(
      shiftAutoCloseWarning({
        ...open(17 * 60),
        currentSegmentMinutes: 15 * 60,
      })?.remainingMinutes,
    ).toBe(60);
  });

  it("never warns with no shift or a closed one", () => {
    expect(shiftAutoCloseWarning(null)).toBeNull();
    expect(
      shiftAutoCloseWarning({ status: "closed", workedMinutes: 900 }),
    ).toBeNull();
  });

  it("warns from one hour before the limit", () => {
    expect(SHIFT_WARNING_MINUTES).toBe(60);
    expect(shiftAutoCloseWarning(open((MAX_SHIFT_HOURS - 2) * 60))).toBeNull();
    expect(
      shiftAutoCloseWarning(open((MAX_SHIFT_HOURS - 1) * 60)),
    ).not.toBeNull();
  });
});
