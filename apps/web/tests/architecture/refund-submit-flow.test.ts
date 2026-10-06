import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  new URL("../../src/app/refunds/page.tsx", import.meta.url),
  "utf8",
);
const modal = readFileSync(
  new URL("../../src/components/refunds/refund-order-modal.tsx", import.meta.url),
  "utf8",
);
const picker = readFileSync(
  new URL("../../src/components/refunds/order-picker.tsx", import.meta.url),
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
    // the modal reports only the create failure; the page owns the refresh
    expect(modal).toMatch(
      /created = await createRefund[\s\S]*?onSaved\(created\)[\s\S]*?catch \(cause\)[\s\S]*?تعذر تسجيل المرتجع/,
    );
    expect(page).toMatch(
      /onSaved=\{\(refund\) => \{[\s\S]*?setDetail\(refund\)[\s\S]*?load\(\)\.catch\([\s\S]*?تم تسجيل المرتجع، لكن تعذر تحديث البيانات/,
    );
  });

  it("tells non-cashiers that recording refunds is cashier-only", () => {
    expect(page).toContain("لحساب الكاشير فقط");
  });

  it("clears the refunds search icon on the inline-start side", () => {
    expect(picker).toContain("ps-11");
    expect(picker).not.toContain("pe-11");
  });

  it("initializes a missing draft entry from the normalizer before updating", () => {
    expect(
      modal.match(
        /\[\s*line\.id\s*\]: \{\s*\.\.\.refundDraftEntry\(state, line\.id\)/g,
      ),
    ).toHaveLength(2);
  });
});
