import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const list = readFileSync(
  new URL("../../src/app/orders/page.tsx", import.meta.url),
  "utf8",
);
const detail = readFileSync(
  new URL("../../src/app/orders/detail/page.tsx", import.meta.url),
  "utf8",
);

describe("orders list refund badge", () => {
  it("labels full and partial refunds on the status column", () => {
    expect(list).toContain("مرتجع بالكامل");
    expect(list).toContain("مرتجع جزئي");
    // nothing renders when nothing was refunded
    expect(list).toMatch(/refundStatus === "full" /);
  });
});

describe("order detail refund visibility", () => {
  it("shows how much of each line came back", () => {
    expect(detail).toContain("المرتجع");
    expect(detail).toMatch(/refundedQuantity|\u0623?رُجِّع/);
  });

  it("links every refund of the order", () => {
    expect(detail).toMatch(/order\.refunds|refunds\.map/);
    expect(detail).toContain("/refunds?refund=");
  });

  it("never merges refunds into the printed receipt", () => {
    expect(detail).toMatch(/OrderReceipt order=\{order\}/);
  });
});
