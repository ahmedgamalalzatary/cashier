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
