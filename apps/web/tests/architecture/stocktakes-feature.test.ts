import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  new URL("../../src/app/stocktakes/page.tsx", import.meta.url),
  "utf8",
);

describe("stocktakes page structure", () => {
  it("opens the new-session and single-item adjust forms in two modals", () => {
    expect(page).toContain("جرد جديد");
    expect(page).toContain("تسوية صنف");
    expect((page.match(/<Modal/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("keeps the list and open session on the page, not inline forms", () => {
    expect(page).not.toMatch(/Section\s+title="جلسة جرد جديدة"/);
    expect(page).not.toMatch(/Section\s+title="تسوية صنف واحد"/);
    expect(page).toContain("سجل الجرد والتسويات");
  });

  it("closes each modal after its action succeeds", () => {
    expect(page).toMatch(/startStocktake[\s\S]{0,200}\/\* close start \*\//);
    expect(page).toMatch(/createManualAdjustment[\s\S]{0,400}\/\* close adjust \*\//);
  });

  it("lets the adjustment modal pick its own warehouse", () => {
    // the adjust modal holds its own warehouse selector and reloads stock for it
    const adjust = page.match(
      /showAdjust && \([\s\S]*?<\/Modal>/,
    )?.[0] ?? "";
    expect(adjust).toMatch(/label="المخزن"/);
    expect(adjust).toMatch(/setWarehouse/);
    expect(adjust).toMatch(/getMainWarehouseStock|getCafeWarehouseStock/);
    expect(adjust).toContain(".then(setStock)");
  });

  it("reports rejected submissions inside each modal", () => {
    const startModal = page.match(/showStart && \([\s\S]*?<\/Modal>/)?.[0] ?? "";
    const adjustModal = page.match(/showAdjust && \([\s\S]*?<\/Modal>/)?.[0] ?? "";
    expect(startModal).toMatch(/formError/i);
    expect(adjustModal).toMatch(/formError/i);
  });
});
