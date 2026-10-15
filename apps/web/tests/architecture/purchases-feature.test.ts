import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (relative: string) =>
  fs.readFileSync(path.resolve(process.cwd(), relative), "utf8");

describe("purchase invoice journey", () => {
  it("has its own route, opened from the invoice page", () => {
    const page = read("src/app/purchases/journey/page.tsx");
    expect(page).toContain("getPurchaseJourney");
    expect(page).toContain("journeyCostSegments");
    expect(page).toContain("unmatchedSaleQuantity");
    expect(read("src/app/purchases/detail/page.tsx")).toContain(
      "/purchases/journey?id=",
    );
    expect(read("src/services/purchases-service.ts")).toContain(
      "/api/purchases/${id}/journey",
    );
  });
});

describe("purchase payment allocation", () => {
  it("shows covered and remaining and follows the status", () => {
    const list = read("src/app/purchases/page.tsx");
    expect(list).toContain("coveredAmount");
    expect(list).toContain("remainingAmount");
    expect(list).toContain("purchaseStatusLabel");

    const detail = read("src/app/purchases/detail/page.tsx");
    expect(detail).toContain("invoice.coveredAmount");
    expect(detail).toContain("invoice.remainingAmount");
    expect(detail).toContain("purchaseStatusLabel");
  });

  it("offers the payment action only while the supplier owes money", () => {
    expect(read("src/app/purchases/detail/page.tsx")).toContain(
      "supplierHasBalance &&",
    );
    expect(read("src/app/suppliers/page.tsx")).toContain(
      "Number(s.balance) > 0 &&",
    );
    expect(read("src/app/suppliers/statement/page.tsx")).toContain(
      "Number(supplier.balance) > 0 &&",
    );
  });
});
