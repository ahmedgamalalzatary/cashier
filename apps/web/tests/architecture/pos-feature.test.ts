import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NAV_ITEMS } from "../../src/lib/navigation";

describe("POS feature boundaries", () => {
  it("provides a real POS route in shared navigation", () => {
    const pagePath = path.resolve(process.cwd(), "src/app/pos/page.tsx");
    expect(fs.existsSync(pagePath)).toBe(true);
    const page = fs.readFileSync(pagePath, "utf8");
    expect(page).toContain("listCatalog");
    expect(page).toContain("getCurrentShift");
    expect(page).toContain("createOrder");
    expect(page).toContain("OrderReceipt");
    expect(page).toContain("<Modal");
    expect(page).toContain('aria-label="ابحث باسم المنتج"');
    expect(page).toContain('aria-label="النقد المستلم"');
    expect(page).toContain("تم حفظ الطلب، لكن تعذر تحديث قائمة الطلبات");
    expect(page).toContain('panelClassName="pos-receipt-dialog"');
    expect(NAV_ITEMS).toContainEqual({ href: "/pos", label: "نقطة البيع" });
  });

  it("keeps receipt markup isolated for auto-print and reprint", () => {
    expect(
      fs.existsSync(
        path.resolve(process.cwd(), "src/components/pos/order-receipt.tsx"),
      ),
    ).toBe(true);
  });

  it("uses a valid fixed receipt page size for printing", () => {
    const css = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/globals.css"),
      "utf8",
    );
    expect(css).toContain("size: 80mm 297mm");
    expect(css).not.toContain("size: 80mm auto");
    expect(css).toContain(".pos-receipt-dialog > div");
  });

  it("does not format a missing catalog synchronization timestamp", () => {
    const page = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/pos/page.tsx"),
      "utf8",
    );
    expect(page).toMatch(/catalog\.lastSuccessfulSyncAt\s*\?/);
    expect(page).toContain("لم تتم المزامنة بعد");
  });

  it("polls the current shift and refreshes on window focus", () => {
    const page = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/pos/page.tsx"),
      "utf8",
    );
    expect(page).toContain("refreshShift");
    expect(page).toContain("30_000");
    expect(page).toContain('addEventListener("focus"');
  });

  it("re-checks the shift inside checkout before creating the order", () => {
    const page = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/pos/page.tsx"),
      "utf8",
    );
    expect(page).toMatch(
      /async function completeOrder[\s\S]{0,600}getCurrentShift/,
    );
  });

  it("clears the POS search icon on the inline-start side", () => {
    const page = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/pos/page.tsx"),
      "utf8",
    );
    expect(page).toContain("ps-12");
    expect(page).not.toContain("pe-12");
  });

  it("anchors the printed receipt with logical insets", () => {
    const css = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/globals.css"),
      "utf8",
    );
    const block = css.slice(css.indexOf(".receipt-print-root {"));

    expect(block).toContain("inset-inline-start");
    expect(block).not.toContain("inset: 0 auto auto 0");
  });
});
