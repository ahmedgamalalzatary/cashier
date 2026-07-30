import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  new URL("../../src/app/refunds/page.tsx", import.meta.url),
  "utf8",
);

describe("refund submission flow", () => {
  it("reuses the guarded load helper on mount", () => {
    expect(page).toMatch(/useEffect\(\(\) => \{[\s\S]*?load\(\(\) => cancelled\)/);
    expect(page).not.toMatch(
      /useEffect\(\(\) => \{[\s\S]*?Promise\.all\(\[listOrders\(\), listRefunds\(\)\]\)/,
    );
  });

  it("reports a post-creation refresh failure as a successful refund with stale data", () => {
    expect(page).toContain("تم تسجيل المرتجع، لكن تعذر تحديث البيانات");
    expect(page).toMatch(
      /created = await createRefund[\s\S]*?catch \(cause\)[\s\S]*?تعذر تسجيل المرتجع[\s\S]*?setDetail\(created\)[\s\S]*?await load\(\)[\s\S]*?تم تسجيل المرتجع، لكن تعذر تحديث البيانات/,
    );
  });
});
