import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  new URL("../../src/app/purchases/page.tsx", import.meta.url),
  "utf8",
);

describe("purchases page transfer action", () => {
  it("opens the direct transfer modal from the row for this invoice", () => {
    expect(page).toContain("TransferFormModal");
    expect(page).toContain('mode="direct"');
    expect(page).toContain("initialInvoiceId");
  });

  it("shows the transfer icon only when stock is left to transfer", () => {
    expect(page).toMatch(/hasStockToTransfer && \(/);
    expect(page).toContain("setTransferringId(invoice.id)");
  });

  it("refreshes the list after the transfer saves", () => {
    const modal = page.slice(page.indexOf("transferringId && ("));
    expect(modal).toMatch(/setTransferringId\(null\);\s*void load\(\)/);
  });

  it("works without leaving the purchases page", () => {
    // the invoice route stays a fallback; the row conducts its own modal
    expect(page).not.toMatch(
      /href=.{0,20}transfers\?direct=1&invoice=[^"]*"[^>]*تحويل إلى الكافيه/,
    );
  });
});
