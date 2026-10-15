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

  it("gives each cashier order row its own receipt print", () => {
    const page = read("src/app/orders/page.tsx");
    expect(page).toContain("<OrderPrintButton");
  });

  it("prints the order page receipt through the slip, not a hidden div", () => {
    const page = read("src/app/orders/detail/page.tsx");
    expect(page).toContain("<PrintSlip");
    expect(page).toContain("window.print()");
    expect(page).toContain("<OrderReceipt");
    expect(page).not.toContain("hidden print:block");
  });
});

describe("A4 printing", () => {
  it("prints the recipe cost card on A4 portrait", () => {
    const modal = read("src/components/recipes/cost-card-modal.tsx");
    expect(modal).toContain("<PrintSlip");
    expect(modal).toContain("a4-print-root");
    expect(modal).toContain("window.print()");
    expect(read("src/app/recipes/page.tsx")).toContain("<CostCardModal");

    const css = read("src/app/globals.css");
    expect(css).toMatch(/@page a4\s*\{\s*size:\s*A4 portrait/);
    expect(css).toMatch(/\.a4-print-root\s*\{\s*page:\s*a4/);
  });
});
