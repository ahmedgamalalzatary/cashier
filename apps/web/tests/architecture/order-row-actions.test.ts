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
const modal = readFileSync(
  new URL(
    "../../src/components/orders/order-waste-modal.tsx",
    import.meta.url,
  ),
  "utf8",
);

describe("order rows offer refund and waste", () => {
  it("opens the refund modal from the row, hidden once fully refunded", () => {
    expect(list).toContain('title="مرتجع"');
    expect(list).toContain('refundStatus !== "full"');
    expect(detail).toContain('refundStatus !== "full"');
  });

  it("opens the order waste modal from the row and the page", () => {
    expect(list).toContain("OrderWasteModal");
    expect(detail).toContain("OrderWasteModal");
    // online orders wait for phase 7
    expect(list.slice(list.indexOf("ExternalOrdersPanel"), list.indexOf("OrderWasteModal"))).not.toContain("orderId");
  });

  it("presets waste to the cafe and the order's own products", () => {
    expect(modal).toContain('presetWarehouse="cafe"');
    expect(modal).toContain("orderWasteTargetKeys(order)");
    expect(modal).toContain("غير قابل للإرجاع");
  });

  it("refreshes the list after saving waste", () => {
    expect(list).toContain("void load()");
  });
});
