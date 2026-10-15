import path from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tab = readFileSync(
  path.resolve(process.cwd(), "src/components/salaries/salaries-tab.tsx"),
  "utf8",
);

describe("salaries tab: advance modal and figures", () => {
  it("opens the advance/adjustment form from a header button in a modal", () => {
    expect(tab).toContain("صرف جزء من الراتب");
    expect(tab).toContain("<Modal");
    expect(tab).not.toMatch(/Section\s+title="تسجيل سلفة أو تسوية"/);
  });

  it("keeps سلفة in the type options", () => {
    expect(tab).toContain('value="advance">سلفة<');
  });

  it("shows what was paid so far and what remains per employee", () => {
    expect(tab).toContain("صُرف حتى الآن");
    expect(tab).toContain("المتبقي");
    expect(tab).toContain("salaryPaidSoFar");
    expect(tab).toContain("salaryRemaining");
  });

  it("reports a rejected submission inside the modal", () => {
    const modal = tab.match(/logging && \([\s\S]*?<\/Modal>/)?.[0] ?? "";
    expect(modal).toContain("formError");
  });
});
