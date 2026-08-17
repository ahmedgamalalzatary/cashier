import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_PATHS, NAV_ITEMS } from "../../src/lib/navigation";

const read = (relative: string) =>
  fs.readFileSync(path.resolve(process.cwd(), relative), "utf8");

describe("orders feature boundaries", () => {
  it("is reachable by cashiers as well as admins", () => {
    expect(NAV_ITEMS).toContainEqual({ href: "/orders", label: "الطلبات" });
    expect(ADMIN_PATHS).not.toContain("/orders");
  });

  it("lists orders through the model, not ad-hoc filtering", () => {
    const page = read("src/app/orders/page.tsx");
    expect(page).toContain("listOrders");
    expect(page).toContain("filterOrders");
    expect(page).toContain("ordersTotals");
    expect(page).toContain("orderCashiers");
    expect(page).toContain('aria-label="البحث عن طلب"');
    expect(page).toContain("/orders/");
  });

  it("opens one order on its own route with a reprintable receipt", () => {
    const page = read("src/app/orders/[id]/page.tsx");
    expect(page).toContain("getOrder");
    expect(page).toContain("OrderReceipt");
    expect(page).toContain("window.print()");
  });

  it("keeps cost and profit out of the cashier's view", () => {
    for (const relative of ["src/app/orders/page.tsx", "src/app/orders/[id]/page.tsx"]) {
      const page = read(relative);
      expect(page).toContain("orderMargin");
      expect(page).toContain('user?.role === "admin"');
    }
  });
});
