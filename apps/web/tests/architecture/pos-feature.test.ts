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
});
