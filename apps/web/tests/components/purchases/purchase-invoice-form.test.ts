import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const form = readFileSync(
  new URL(
    "../../../src/components/purchases/purchase-invoice-form.tsx",
    import.meta.url,
  ),
  "utf8",
);

describe("purchase invoice line layout", () => {
  it("shares the card's width instead of fixed columns that overflow it", () => {
    const grid = /grid gap-3 lg:grid-cols-\[([^\]]+)\]/.exec(form)?.[1];

    expect(grid).toBe("minmax(12rem,1.5fr)_repeat(4,minmax(0,1fr))");
  });

  it("keeps the cafe label on one line and states its unit as a hint", () => {
    expect(form).toContain('label="للكافيه الآن"');
    expect(form).toContain(
      'hint={`بوحدة المخزون (${item?.stockUnit ?? "—"})`}',
    );
  });
});
