import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (relative: string) =>
  fs.readFileSync(path.resolve(process.cwd(), relative), "utf8");

describe("print wiring", () => {
  it.each([
    ["src/app/suppliers/statement/page.tsx", "SupplierStatementSlip"],
    ["src/app/purchases/detail/page.tsx", "PurchaseInvoiceSlip"],
    ["src/app/stocktakes/page.tsx", "StocktakeCountSlip"],
    ["src/app/transfers/detail/page.tsx", "TransferDocument"],
    ["src/components/salaries/salaries-tab.tsx", "SalaryPayslip"],
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
  it("shares one A4 layout for every filed document", () => {
    const layout = read("src/components/print/a4-document.tsx");
    expect(layout).toContain("a4-print-root");
    expect(layout).toContain("الكافيه");
  });

  it.each([
    ["src/components/purchases/purchase-invoice-slip.tsx", "A4Document"],
    ["src/components/suppliers/supplier-statement-slip.tsx", "A4Document"],
    ["src/components/stocktakes/stocktake-count-slip.tsx", "A4Document"],
    ["src/components/transfers/transfer-document.tsx", "A4Document"],
    ["src/components/salaries/salary-payslip.tsx", "A4Document"],
    ["src/components/recipes/cost-card-document.tsx", "A4Document"],
  ])("%s prints through the shared A4 layout", (relative, marker) => {
    expect(read(relative)).toContain(marker);
  });

  it("prints the recipe cost card on A4 portrait", () => {
    const modal = read("src/components/recipes/cost-card-modal.tsx");
    expect(modal).toContain("<PrintSlip");
    expect(modal).toContain("CostCardDocument");
    expect(modal).toContain("window.print()");
    expect(read("src/app/recipes/page.tsx")).toContain("<CostCardModal");

    const css = read("src/app/globals.css");
    expect(css).toMatch(/@page a4\s*\{\s*size:\s*A4 portrait/);
    expect(css).toMatch(/\.a4-print-root\s*\{\s*page:\s*a4/);
  });
});
