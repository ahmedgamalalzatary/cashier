import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  new URL("../../src/app/waste/page.tsx", import.meta.url),
  "utf8",
);

describe("waste submission flow", () => {
  it("formats allocation unit costs as money", () => {
    expect(page).toContain("formatMoney(allocation.unitCost)");
  });

  it("reuses a draft-scoped request id across retries", () => {
    expect(page).toContain(
      "const [clientRequestId, setClientRequestId] = useState(() =>",
    );
    expect(page).toMatch(/createWaste\(\{[\s\S]{0,100}?clientRequestId,/);
    expect(page).not.toMatch(
      /createWaste\(\{[\s\S]{0,100}?clientRequestId:\s*crypto\.randomUUID\(\)/,
    );
    expect(page.match(/disabled=\{saving\}/g)).toHaveLength(5);
  });
});
