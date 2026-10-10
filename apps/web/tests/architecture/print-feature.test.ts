import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (relative: string) =>
  fs.readFileSync(path.resolve(process.cwd(), relative), "utf8");

describe("80mm printing", () => {
  it.each([
    ["src/app/suppliers/statement/page.tsx", "SupplierStatementSlip"],
    ["src/app/purchases/detail/page.tsx", "PurchaseInvoiceSlip"],
    ["src/app/stocktakes/page.tsx", "StocktakeCountSlip"],
    ["src/components/orders/external-orders-panel.tsx", "ExternalOrderSlip"],
  ])("%s prints its own slip", (relative, slip) => {
    const source = read(relative);
    expect(source).toContain(slip);
    expect(source).toContain("<PrintSlip");
    expect(source).toContain("window.print()");
  });

  it("prints only the slip, so the hidden page does not feed blank paper", () => {
    const css = read("src/app/globals.css");
    expect(css).toMatch(/\.print-slip\s*\{\s*display:\s*none/);
    expect(css).toContain(
      "body:has(> .print-slip) > :not(.print-slip)",
    );
  });
});
