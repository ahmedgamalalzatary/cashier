import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  new URL("../../src/app/waste/page.tsx", import.meta.url),
  "utf8",
);
// the entry form is shared by the waste page and the POS pop-up
const form = readFileSync(
  new URL("../../src/components/waste/waste-entry-form.tsx", import.meta.url),
  "utf8",
);

describe("waste submission flow", () => {
  it("formats allocation unit costs as money", () => {
    expect(page).toContain("formatMoney(allocation.unitCost)");
  });

  it("reuses a draft-scoped request id across retries", () => {
    expect(form).toContain(
      "const [clientRequestId, setClientRequestId] = useState(() =>",
    );
    expect(form).toMatch(/createWaste\(\{[\s\S]{0,100}?clientRequestId,/);
    expect(form).not.toMatch(
      /createWaste\(\{[\s\S]{0,100}?clientRequestId:\s*crypto\.randomUUID\(\)/,
    );
    expect(form.match(/disabled=\{saving\}/g)).toHaveLength(5);
  });

  it("tells the user a product is always recorded in the cafe warehouse", () => {
    expect(form).toContain("يُسجل في مخزن الكافيه فقط");
  });
});
